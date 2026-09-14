"use strict";

const DEFAULT_CAPACITY = 100;
const REDACTED = "[REDACTED]";
const REDACTED_SDP = "[REDACTED SDP]";

const SDP_KEY = /(?:^|_)(?:offer|answer|sdp)$/i;
const BODY_KEY = /(?:^|_)(?:body|content|transcript_body)$/i;
const SAFE_CREDENTIAL_METADATA_SUFFIX = /_(?:count|type)$/;

function normalizeKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCredentialKey(normalizedKey) {
  if (SAFE_CREDENTIAL_METADATA_SUFFIX.test(normalizedKey)) return false;
  const segments = normalizedKey.split("_");
  if (segments.some((segment) => segment === "token" || segment === "secret" || segment === "authorization" || segment === "bearer")) {
    return true;
  }
  return /(?:^|_)(?:api_key)(?:_|$)/.test(normalizedKey);
}

function redactString(value) {
  if (/^v=0(?:\r?\n|$)/.test(value) || /(?:^|\r?\n)m=(?:audio|video)\s/m.test(value)) return REDACTED_SDP;
  return value
    .replace(/Bearer\s+[^\s"']+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|secret|token)\s*[:=]\s*[^\s,"']+/gi,
      (_match, label) => `${label}=${REDACTED}`,
    )
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(?:sk|ek)[_-][A-Za-z0-9_-]+\b/g, REDACTED)
    .slice(0, 1_000);
}

function sanitize(value, key = "", seen = new WeakSet(), depth = 0, transcriptContext = false) {
  const normalizedKey = normalizeKey(key);
  const insideTranscript = transcriptContext || /(?:^|_)transcript(?:_|$)/.test(normalizedKey);
  if (isCredentialKey(normalizedKey)) return REDACTED;
  if (SDP_KEY.test(normalizedKey)) return REDACTED_SDP;
  if (BODY_KEY.test(normalizedKey)) return REDACTED;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (insideTranscript && /^(?:transcript|text|body|content|delta|value)$/.test(normalizedKey)) return REDACTED;
    const trimmed = value.trim();
    if (depth < 8 && ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          return JSON.stringify(sanitize(parsed, key, seen, depth + 1, insideTranscript));
        }
      } catch { /* It is ordinary text, not encoded structured detail. */ }
    }
    return redactString(value);
  }
  if (typeof value === "undefined") return null;
  if (typeof value !== "object") return String(value).slice(0, 200);
  if (depth >= 8 || seen.has(value)) return "[REDACTED CIRCULAR OR DEEP VALUE]";
  seen.add(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitize(entry, key, seen, depth + 1, insideTranscript));
  }
  const result = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 50)) {
    result[childKey] = sanitize(childValue, childKey, seen, depth + 1, insideTranscript);
  }
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function createDiagnosticsStore({ now = Date.now, capacity = DEFAULT_CAPACITY } = {}) {
  if (typeof now !== "function") throw new TypeError("Diagnostics now must be a function.");
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000) {
    throw new TypeError("Diagnostics capacity must be an integer from 1 to 1000.");
  }

  let sequence = 0;
  let entries = [];
  const listeners = new Set();

  function snapshot() {
    return deepFreeze(entries.slice());
  }

  function publish() {
    const current = snapshot();
    for (const listener of listeners) {
      try { listener(current); } catch { /* Passive diagnostics must not disrupt the failing service. */ }
    }
  }

  function note(input) {
    if (!input || typeof input !== "object") throw new TypeError("A diagnostic record is required.");
    if (typeof input.component !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(input.component)) {
      throw new TypeError("Diagnostic component names must be stable lowercase identifiers.");
    }
    if (typeof input.code !== "string" || !/^[A-Z][A-Z0-9_]{2,79}$/.test(input.code)) {
      throw new TypeError("Diagnostic codes must be stable uppercase identifiers.");
    }
    if (typeof input.recovery !== "string" || input.recovery.trim().length === 0) {
      throw new TypeError("Diagnostic recovery guidance is required.");
    }

    sequence += 1;
    const timestampValue = now();
    const timestamp = new Date(timestampValue).toISOString();
    const entry = deepFreeze({
      id: `diagnostic-${sequence}`,
      timestamp,
      component: input.component,
      code: input.code,
      recovery: redactString(input.recovery.trim()),
      detail: sanitize(input.detail ?? null),
    });
    entries = [...entries, entry].slice(-capacity);
    publish();
    return entry;
  }

  function list() {
    return snapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A diagnostics listener is required.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clear() {
    entries = [];
    publish();
  }

  return Object.freeze({ note, list, subscribe, clear });
}

module.exports = { createDiagnosticsStore };
