"use strict";

const dns = require("node:dns").promises;

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata",
  "metadata.internal",
]);

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

function parseDottedIpv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    octets.push(value);
  }
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function parseNumber(part) {
  if (/^0x[0-9a-f]+$/iu.test(part)) {
    const value = Number.parseInt(part, 16);
    return Number.isFinite(value) ? value : null;
  }
  if (/^0[0-7]+$/u.test(part)) {
    const value = Number.parseInt(part, 8);
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d+$/u.test(part)) {
    const value = Number(part);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function parseLegacyIpv4(host) {
  const looksNumeric = [...host].every((char) =>
    (char >= "0" && char <= "9")
    || char === "."
    || char === "x"
    || char === "X"
    || (char >= "a" && char <= "f")
    || (char >= "A" && char <= "F"));
  if (!looksNumeric || ![...host].some((char) => char >= "0" && char <= "9")) return null;
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4 || parts.some((part) => part === "")) return null;
  const values = [];
  for (const part of parts) {
    const parsed = parseNumber(part);
    if (parsed === null) return null;
    values.push(parsed);
  }
  let value;
  switch (values.length) {
    case 1:
      if (values[0] > 0xffff_ffff) return null;
      value = values[0];
      break;
    case 2:
      if (values[0] > 0xff || values[1] > 0xff_ffff) return null;
      value = ((values[0] << 24) | values[1]) >>> 0;
      break;
    case 3:
      if (values[0] > 0xff || values[1] > 0xff || values[2] > 0xffff) return null;
      value = ((values[0] << 24) | (values[1] << 16) | values[2]) >>> 0;
      break;
    case 4:
      if (values.some((octet) => octet > 0xff)) return null;
      value = ((values[0] << 24) | (values[1] << 16) | (values[2] << 8) | values[3]) >>> 0;
      break;
    default:
      return null;
  }
  return value >>> 0;
}

function ipv6ToBigInt(literal) {
  const lower = literal.toLowerCase();
  if (lower.includes(".")) return null;
  const [head, tail] = lower.split("::");
  const headParts = head === "" || head === undefined ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");
  if (tail === undefined) {
    if (headParts.length !== 8) return null;
  } else if (headParts.length + tailParts.length > 7) {
    return null;
  }
  const missing = 8 - headParts.length - (tail === undefined ? 0 : tailParts.length);
  const parts = [
    ...headParts,
    ...(tail === undefined ? [] : Array.from({ length: missing }, () => "0")),
    ...tailParts,
  ];
  if (parts.length !== 8) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/u.test(part)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(part, 16));
  }
  return value;
}

function parseIpv6Literal(literal) {
  const value = ipv6ToBigInt(literal);
  if (value === null) return null;
  const ipv4MappedPrefix = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;
  const ipv4MappedMask = 0xffff_ffff_ffff_ffff_ffff_ffff_0000_0000n;
  if ((value & ipv4MappedMask) === ipv4MappedPrefix) {
    return { kind: "v4", value: Number(value & 0xffff_ffffn) >>> 0 };
  }
  return { kind: "v6", value };
}

function parseHostIp(hostname, normalizedHost) {
  if (hostname.startsWith("[")) {
    return parseIpv6Literal(hostname.replace(/^\[|\]$/gu, "").toLowerCase());
  }
  const dotted = parseDottedIpv4(normalizedHost);
  if (dotted !== null) return { kind: "v4", value: dotted };
  const legacy = parseLegacyIpv4(normalizedHost);
  if (legacy !== null) return { kind: "v4", value: legacy };
  return null;
}

function blockedIpv4(value, allowLoopback) {
  const a = (value >>> 24) & 0xff;
  const b = (value >>> 16) & 0xff;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return !allowLoopback;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedIpv6(value, allowLoopback) {
  if (value === 0n || value === 1n) return !allowLoopback;
  // fc00::/7 unique local
  if ((value >> 121n) === 0x7en) return true;
  // fe80::/10 link local
  if ((value >> 118n) === 0x3fan) return true;
  return false;
}

function blockedHostname(host, allowLoopback) {
  if (METADATA_HOSTS.has(host)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return !allowLoopback;
  return false;
}

function blockedAddress(address, allowLoopback) {
  const normalized = String(address).replace(/^\[|\]$/gu, "").toLowerCase();
  const ip = parseHostIp(normalized.includes(":") ? `[${normalized}]` : normalized, normalized);
  if (!ip) return false;
  if (ip.kind === "v4") return blockedIpv4(ip.value, allowLoopback);
  return blockedIpv6(ip.value, allowLoopback);
}

function validateAiNavigationUrl(input, allowLoopback) {
  const value = typeof input === "string" ? input.trim() : "";
  const lower = value.toLowerCase();
  if (
    value === ""
    || value.includes("\\")
    || !(lower.startsWith("http://") || lower.startsWith("https://"))
  ) {
    return { allowed: false, reason: "INVALID_URL" };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "SCHEME_OR_CREDENTIALS_BLOCKED" };
  }
  if (parsed.username || parsed.password) {
    return { allowed: false, reason: "SCHEME_OR_CREDENTIALS_BLOCKED" };
  }
  const host = parsed.hostname;
  if (!host) return { allowed: false, reason: "INVALID_URL" };
  const normalizedHost = host.replace(/\.$/u, "").toLowerCase();
  if (!normalizedHost || (normalizedHost.includes(".") && normalizedHost.startsWith("."))) {
    return { allowed: false, reason: "INVALID_URL" };
  }
  const ip = parseHostIp(parsed.hostname, normalizedHost);
  if (ip) {
    if (ip.kind === "v4" ? blockedIpv4(ip.value, allowLoopback) : blockedIpv6(ip.value, allowLoopback)) {
      return { allowed: false, reason: "BLOCKED_ADDRESS" };
    }
  } else if (blockedHostname(normalizedHost, allowLoopback)) {
    return { allowed: false, reason: "BLOCKED_ADDRESS" };
  }
  return { allowed: true, url: value, hostname: normalizedHost, parsed };
}

async function defaultResolveDns(hostname) {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function createBrowserNavigationPolicy({
  allowLoopback = false,
  resolveDns = defaultResolveDns,
  resolutionTimeoutMs = 1_500,
} = {}) {
  let policyEpoch = 0;

  async function resolveAndValidate(hostname) {
    if (!hostname) return { allowed: false, reason: "INVALID_URL" };
    const ip = parseHostIp(hostname.includes(":") ? `[${hostname}]` : hostname, hostname);
    if (ip) {
      const blocked = ip.kind === "v4"
        ? blockedIpv4(ip.value, allowLoopback)
        : blockedIpv6(ip.value, allowLoopback);
      return blocked
        ? { allowed: false, reason: "BLOCKED_ADDRESS" }
        : { allowed: true, addresses: [hostname] };
    }
    let addresses;
    try {
      addresses = await withTimeout(
        Promise.resolve(resolveDns(hostname)),
        resolutionTimeoutMs,
        "DNS resolution",
      );
    } catch {
      return { allowed: false, reason: "DNS_RESOLUTION_FAILED" };
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return { allowed: false, reason: "DNS_RESOLUTION_FAILED" };
    }
    for (const address of addresses) {
      if (blockedAddress(address, allowLoopback)) {
        return { allowed: false, reason: "BLOCKED_ADDRESS", addresses };
      }
    }
    return { allowed: true, addresses: [...addresses] };
  }

  async function resolveDestination(input) {
    const structural = validateAiNavigationUrl(input, allowLoopback);
    if (!structural.allowed) return Object.freeze({ allowed: false, reason: structural.reason });
    const resolved = await resolveAndValidate(structural.hostname);
    if (!resolved.allowed) {
      return Object.freeze({
        allowed: false,
        reason: resolved.reason,
        ...(resolved.addresses ? { addresses: Object.freeze([...resolved.addresses]) } : {}),
      });
    }
    return Object.freeze({
      allowed: true,
      url: structural.url,
      addresses: Object.freeze([...resolved.addresses]),
      policyEpoch,
    });
  }

  async function revalidateDestination(_fromUrl, toUrl) {
    return resolveDestination(toUrl);
  }

  function rotatePolicyEpoch() {
    policyEpoch += 1;
    return policyEpoch;
  }

  return Object.freeze({
    getPolicyEpoch: () => policyEpoch,
    resolveDestination,
    revalidateDestination,
    rotatePolicyEpoch,
    decideNavigation: (url) => {
      const structural = validateAiNavigationUrl(url, allowLoopback);
      return structural.allowed
        ? { allowed: true, url: structural.url }
        : { allowed: false, reason: structural.reason };
    },
  });
}

module.exports = {
  createBrowserNavigationPolicy,
  validateAiNavigationUrl,
};
