/**
 * Pure browser URL / origin / AI-navigation policy.
 *
 * Adapted from VMark:
 * - `src/lib/browser/url.ts`
 * - `src/lib/browser/origin/originGuard.ts`
 * - `src-tauri/src/browser/ai_policy.rs`
 *
 * Returns decisions and redacted display URLs only. Does not navigate or authorize.
 */

const NAVIGABLE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  "https:": 443,
  "http:": 80,
};

export type CanonicalOrigin = {
  /** Lowercased scheme without the trailing colon, e.g. "https". */
  scheme: string;
  /** Punycode ASCII host, lowercased, trailing dot stripped. */
  host: string;
  /** Explicit port with default ports (443/80) filled in. */
  port: number;
};

export type OriginPatternInfo = {
  wildcard: boolean;
  scheme: string;
  host: string;
  port: number;
};

export type AiNavigationDecision =
  | { ok: true; url: string }
  | { ok: false };

type ParsedPattern = {
  origin: CanonicalOrigin;
  wildcard: boolean;
};

/** Canonicalize a navigable http(s) URL for tab dedup, or null if not navigable. */
export function canonicalizeBrowserUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!NAVIGABLE_PROTOCOLS.has(url.protocol)) return null;

  const host = url.hostname.replace(/\.$/u, "");
  if (host === "") return null;
  if (!host.startsWith("[") && host.split(".").some((label) => label === "")) {
    return null;
  }

  url.hostname = host;
  url.hash = "";
  return url.href;
}

/**
 * AI-facing URL: scheme/host/port/path only.
 * Strips userinfo, query, and fragment so tokens never cross the trust boundary.
 */
export function urlForAgent(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Pre-authorization display: origin only.
 * Opaque origins expose scheme only; unparseable input becomes a placeholder.
 */
export function originForAgent(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin === "null") return `${parsed.protocol}(opaque)`;
    return parsed.origin;
  } catch {
    return "(unknown origin)";
  }
}

/**
 * Persistence-facing URL: strip embedded password, keep username for identity.
 */
export function urlForPersistence(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.password) return url;
    parsed.password = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/** Stable string key for a canonical origin: `scheme://host:port`. */
export function originKey(origin: CanonicalOrigin): string {
  return `${origin.scheme}://${origin.host}:${origin.port}`;
}

/** Parse an input URL into a canonical web origin, or null if not navigable http(s). */
export function canonicalizeOrigin(input: string): CanonicalOrigin | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const defaultPort = DEFAULT_PORTS[url.protocol];
  if (defaultPort === undefined) return null;

  const host = url.hostname.replace(/\.$/u, "");
  if (host === "") return null;
  if (!host.startsWith("[") && host.split(".").some((label) => label === "")) {
    return null;
  }

  const port = url.port === "" ? defaultPort : Number(url.port);
  return {
    scheme: url.protocol.replace(/:$/u, ""),
    host,
    port,
  };
}

function parseOriginPattern(pattern: string): ParsedPattern | null {
  const trimmed = pattern.trim();
  if (trimmed === "") return null;

  let wildcard = false;
  let candidate = trimmed;

  const marker = "://*.";
  const index = trimmed.indexOf(marker);
  if (index !== -1) {
    wildcard = true;
    const scheme = trimmed.slice(0, index);
    const base = trimmed.slice(index + marker.length);
    if (base === "" || base.startsWith(".")) return null;
    candidate = `${scheme}://${base}`;
  }
  if (candidate.includes("*")) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;
  if (url.search !== "" || url.hash !== "") return null;

  const origin = canonicalizeOrigin(candidate);
  return origin === null ? null : { origin, wildcard };
}

export function isOriginPattern(pattern: string): boolean {
  return parseOriginPattern(pattern) !== null;
}

export function describeOriginPattern(pattern: string): OriginPatternInfo | null {
  const parsed = parseOriginPattern(pattern);
  if (parsed === null) return null;
  return {
    wildcard: parsed.wildcard,
    scheme: parsed.origin.scheme,
    host: parsed.origin.host,
    port: parsed.origin.port,
  };
}

export function originMatchesPattern(
  target: CanonicalOrigin,
  pattern: string,
): boolean {
  const parsed = parseOriginPattern(pattern);
  if (parsed === null) return false;
  if (target.scheme !== parsed.origin.scheme) return false;
  if (target.port !== parsed.origin.port) return false;
  if (parsed.wildcard) {
    return target.host.endsWith(`.${parsed.origin.host}`);
  }
  return target.host === parsed.origin.host;
}

export function isOriginGranted(
  targetUrl: string,
  grants: readonly string[],
): boolean {
  const target = canonicalizeOrigin(targetUrl);
  if (target === null) return false;
  return grants.some((pattern) => originMatchesPattern(target, pattern));
}

/**
 * Validate an AI navigation destination.
 * Returns the trimmed URL when allowed; never navigates.
 */
export function validateAiNavigationUrl(
  input: string,
  allowLoopback: boolean,
): AiNavigationDecision {
  const value = input.trim();
  const lower = value.toLowerCase();
  if (
    value === ""
    || value.includes("\\")
    || !(lower.startsWith("http://") || lower.startsWith("https://"))
  ) {
    return { ok: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false };
  }

  const host = parsed.hostname;
  if (host === "") return { ok: false };

  const normalizedHost = host.replace(/\.$/u, "").toLowerCase();
  if (
    normalizedHost === ""
    || (normalizedHost.includes(".") && normalizedHost.startsWith("."))
  ) {
    return { ok: false };
  }

  const ip = parseHostIp(parsed, normalizedHost);
  if (ip !== null) {
    if (blockedIp(ip, allowLoopback)) return { ok: false };
  } else if (blockedHostname(normalizedHost, allowLoopback)) {
    return { ok: false };
  }

  return { ok: true, url: value };
}

type ParsedIp =
  | { kind: "v4"; value: number }
  | { kind: "v6"; value: bigint };

function parseHostIp(parsed: URL, normalizedHost: string): ParsedIp | null {
  const hostname = parsed.hostname;
  if (hostname.startsWith("[")) {
    return parseIpv6Literal(hostname.replace(/^\[|\]$/gu, "").toLowerCase());
  }

  const dotted = parseDottedIpv4(normalizedHost);
  if (dotted !== null) return { kind: "v4", value: dotted };

  const legacy = parseLegacyIpv4(normalizedHost);
  if (legacy !== null) return { kind: "v4", value: legacy };

  return null;
}

function parseDottedIpv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    // Reject octal-looking leading zeros except a lone "0".
    if (part.length > 1 && part.startsWith("0")) return null;
    octets.push(value);
  }
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

function parseIpv6Literal(literal: string): ParsedIp | null {
  const value = ipv6ToBigInt(literal);
  if (value === null) return null;

  // IPv4-mapped IPv6 (::ffff:0:0/96), including Node's `::ffff:7f00:1` form.
  const ipv4MappedPrefix = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;
  const ipv4MappedMask = 0xffff_ffff_ffff_ffff_ffff_ffff_0000_0000n;
  if ((value & ipv4MappedMask) === ipv4MappedPrefix) {
    return { kind: "v4", value: Number(value & 0xffff_ffffn) >>> 0 };
  }

  return { kind: "v6", value };
}

function ipv6ToBigInt(literal: string): bigint | null {
  const lower = literal.toLowerCase();
  if (lower.includes(".")) {
    // IPv4-mapped forms handled elsewhere.
    return null;
  }
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

/**
 * Alternate IPv4 spellings accepted by browser URL parsers
 * (`2130706433`, `127.1`, `0x7f000001`, `0177.0.0.1`).
 */
function parseLegacyIpv4(host: string): number | null {
  const looksNumeric = [...host].every(
    (char) =>
      (char >= "0" && char <= "9")
      || char === "."
      || char === "x"
      || char === "X"
      || (char >= "a" && char <= "f")
      || (char >= "A" && char <= "F"),
  );
  if (!looksNumeric || ![...host].some((char) => char >= "0" && char <= "9")) {
    return null;
  }

  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4 || parts.some((part) => part === "")) {
    return null;
  }

  const values: number[] = [];
  for (const part of parts) {
    const parsed = parseNumber(part);
    if (parsed === null) return null;
    values.push(parsed);
  }

  let value: number;
  switch (values.length) {
    case 1: {
      const [a] = values;
      if (a! > 0xffff_ffff) return null;
      value = a!;
      break;
    }
    case 2: {
      const [a, b] = values;
      if (a! > 0xff || b! > 0xff_ffff) return null;
      value = ((a! << 24) | b!) >>> 0;
      break;
    }
    case 3: {
      const [a, b, c] = values;
      if (a! > 0xff || b! > 0xff || c! > 0xffff) return null;
      value = ((a! << 24) | (b! << 16) | c!) >>> 0;
      break;
    }
    case 4: {
      const [a, b, c, d] = values;
      if ([a, b, c, d].some((octet) => octet! > 0xff)) return null;
      value = ((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0;
      break;
    }
    default:
      return null;
  }
  return value >>> 0;
}

function parseNumber(value: string): number | null {
  let digits: string;
  let radix: number;
  if (value.startsWith("0x") || value.startsWith("0X")) {
    digits = value.slice(2);
    radix = 16;
  } else if (value.startsWith("0o") || value.startsWith("0O")) {
    digits = value.slice(2);
    radix = 8;
  } else if (value.startsWith("0") && value.length > 1) {
    digits = value;
    radix = 8;
  } else {
    digits = value;
    radix = 10;
  }
  if (digits === "") return null;
  const valid =
    radix === 16
      ? /^[0-9a-f]+$/iu.test(digits)
      : radix === 8
        ? /^[0-7]+$/u.test(digits)
        : /^\d+$/u.test(digits);
  if (!valid) return null;
  const parsed = Number.parseInt(digits, radix);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function blockedHostname(host: string, allowLoopback: boolean): boolean {
  const isLocalhost = host === "localhost" || host.endsWith(".localhost");
  return (
    (isLocalhost && !allowLoopback)
    || host === "metadata"
    || host === "instance-data"
    || host === "metadata.google.internal"
    || host.endsWith(".metadata.google.internal")
  );
}

function blockedIp(address: ParsedIp, allowLoopback: boolean): boolean {
  if (address.kind === "v4") {
    return blockedIpv4(address.value, allowLoopback);
  }
  return blockedIpv6(address.value, allowLoopback);
}

function blockedIpv4(value: number, allowLoopback: boolean): boolean {
  const loopback = inIpv4Range(value, 0x7f00_0000, 8);
  const privateRange =
    inIpv4Range(value, 0x0a00_0000, 8)
    || inIpv4Range(value, 0xac10_0000, 12)
    || inIpv4Range(value, 0xc0a8_0000, 16);
  const linkLocal = inIpv4Range(value, 0xa9fe_0000, 16);
  const shared = inIpv4Range(value, 0x6440_0000, 10);
  const special =
    inIpv4Range(value, 0, 8)
    || inIpv4Range(value, 0xc000_0000, 24)
    || inIpv4Range(value, 0xc000_0200, 24)
    || inIpv4Range(value, 0xc058_6300, 24)
    || inIpv4Range(value, 0xc612_0000, 15)
    || inIpv4Range(value, 0xc633_6400, 24)
    || inIpv4Range(value, 0xcb00_7100, 24)
    || inIpv4Range(value, 0xe000_0000, 4)
    || inIpv4Range(value, 0xf000_0000, 4);

  return (loopback && !allowLoopback) || privateRange || linkLocal || shared || special;
}

function blockedIpv6(value: bigint, allowLoopback: boolean): boolean {
  // IPv4-mapped handled before this path.
  const unspecified = value === 0n;
  const loopback = value === 1n;
  const multicast = inIpv6Range(value, 0xff00_0000_0000_0000_0000_0000_0000_0000n, 8);
  const uniqueLocal = inIpv6Range(value, 0xfc00_0000_0000_0000_0000_0000_0000_0000n, 7);
  const linkLocal = inIpv6Range(value, 0xfe80_0000_0000_0000_0000_0000_0000_0000n, 10);
  const documentation = inIpv6Range(value, 0x2001_0db8_0000_0000_0000_0000_0000_0000n, 32);
  const ietf = inIpv6Range(value, 0x2001_0000_0000_0000_0000_0000_0000_0000n, 32);
  const benchmarking = inIpv6Range(value, 0x2001_0002_0000_0000_0000_0000_0000_0000n, 48);
  const orchid = inIpv6Range(value, 0x2001_0010_0000_0000_0000_0000_0000_0000n, 28);

  return (
    unspecified
    || (loopback && !allowLoopback)
    || multicast
    || uniqueLocal
    || linkLocal
    || documentation
    || ietf
    || benchmarking
    || orchid
  );
}

function inIpv4Range(address: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0;
  return ((address & mask) >>> 0) === ((network & mask) >>> 0);
}

function inIpv6Range(address: bigint, network: bigint, prefix: number): boolean {
  const mask =
    prefix === 0 ? 0n : ((1n << 128n) - 1n) << BigInt(128 - prefix);
  return (address & mask) === (network & mask);
}
