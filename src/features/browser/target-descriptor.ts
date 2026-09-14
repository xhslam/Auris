/**
 * Structured browser target descriptors and payload binding hashes.
 *
 * Pure canonicalization only: no navigation, DOM lookup, or authorization.
 */

import { createHash } from "node:crypto";

export type BrowserTargetDescriptor =
  | { kind: "ref"; ref: string }
  | { kind: "selector"; selector: string };

export type BrowserPayloadHash = `sha256:${string}`;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a wire target descriptor to a strict `{kind,ref|selector}` shape.
 * Rejects ambiguous/extra fields and control characters.
 */
export function canonicalizeTargetDescriptor(
  input: unknown,
): BrowserTargetDescriptor | null {
  if (!isPlainObject(input)) return null;
  if (!hasOwn(input, "kind") || typeof input.kind !== "string") return null;

  const keys = Object.keys(input);
  if (input.kind === "ref") {
    if (keys.length !== 2 || !hasOwn(input, "ref") || typeof input.ref !== "string") {
      return null;
    }
    if (input.ref.length === 0 || input.ref.length > 128) return null;
    if (!ID_PATTERN.test(input.ref) || CONTROL_CHARS.test(input.ref)) return null;
    return { kind: "ref", ref: input.ref };
  }

  if (input.kind === "selector") {
    if (
      keys.length !== 2
      || !hasOwn(input, "selector")
      || typeof input.selector !== "string"
    ) {
      return null;
    }
    if (input.selector.length === 0 || input.selector.length > 512) return null;
    if (CONTROL_CHARS.test(input.selector)) return null;
    return { kind: "selector", selector: input.selector };
  }

  return null;
}

/**
 * Deterministic JSON for hashing: sorted object keys, no NaN/Infinity/bigint/cycles.
 */
export function serializeCanonicalPayload(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value, new WeakSet<object>()));
}

function canonicalizeJsonValue(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("canonical payload rejects non-finite numbers");
      }
      return value;
    case "bigint":
      throw new Error("canonical payload rejects bigint");
    case "undefined":
    case "function":
    case "symbol":
      throw new Error("canonical payload rejects non-JSON values");
    case "object": {
      if (seen.has(value as object)) {
        throw new Error("canonical payload rejects cyclic structures");
      }
      seen.add(value as object);
      if (Array.isArray(value)) {
        const items = value.map((item) => canonicalizeJsonValue(item, seen));
        seen.delete(value as object);
        return items;
      }
      const record = value as Record<string, unknown>;
      const sortedKeys = Object.keys(record).sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      );
      const result: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        result[key] = canonicalizeJsonValue(record[key], seen);
      }
      seen.delete(value as object);
      return result;
    }
    default:
      throw new Error("canonical payload rejects unknown values");
  }
}

/** SHA-256 payload binding hash: `sha256:` + lowercase hex digest. */
export function hashBrowserPayload(payload: unknown): BrowserPayloadHash {
  const canonical = serializeCanonicalPayload(payload);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${digest}`;
}
