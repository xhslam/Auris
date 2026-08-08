import { describe, expect, it } from "vitest";

import {
  canonicalizeTargetDescriptor,
  hashBrowserPayload,
  serializeCanonicalPayload,
} from "../../../src/features/browser/target-descriptor";

describe("canonicalizeTargetDescriptor", () => {
  it("accepts strict ref and selector descriptors", () => {
    expect(canonicalizeTargetDescriptor({ kind: "ref", ref: "node-42" })).toEqual({
      kind: "ref",
      ref: "node-42",
    });
    expect(
      canonicalizeTargetDescriptor({ kind: "selector", selector: "#submit" }),
    ).toEqual({
      kind: "selector",
      selector: "#submit",
    });
  });

  it("rejects ambiguous, extra, empty, and hostile fields", () => {
    expect(
      canonicalizeTargetDescriptor({
        kind: "ref",
        ref: "node-42",
        selector: "#submit",
      }),
    ).toBeNull();
    expect(
      canonicalizeTargetDescriptor({ kind: "ref", ref: "node-42", extra: true }),
    ).toBeNull();
    expect(canonicalizeTargetDescriptor({ kind: "ref", ref: "" })).toBeNull();
    expect(
      canonicalizeTargetDescriptor({ kind: "selector", selector: "a\u0000b" }),
    ).toBeNull();
    expect(canonicalizeTargetDescriptor({ kind: "xpath", value: "//a" })).toBeNull();
    expect(canonicalizeTargetDescriptor(null)).toBeNull();
    expect(canonicalizeTargetDescriptor("node-42")).toBeNull();
  });

  it("returns a stable object shape independent of input key order", () => {
    const shuffled = JSON.parse('{"ref":"node-7","kind":"ref"}') as unknown;
    expect(canonicalizeTargetDescriptor(shuffled)).toEqual({
      kind: "ref",
      ref: "node-7",
    });
  });
});

describe("hashBrowserPayload", () => {
  it("hashes UTF-8 canonical JSON as sha256:<64 hex>", () => {
    const hash = hashBrowserPayload({ action: "type", text: "Auris" });
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(hash).toBe(
      hashBrowserPayload({ text: "Auris", action: "type" }),
    );
  });

  it("is stable across object key order and nested key order", () => {
    const left = {
      target: { kind: "ref", ref: "a" },
      payload: { b: 2, a: 1 },
    };
    const right = {
      payload: { a: 1, b: 2 },
      target: { ref: "a", kind: "ref" },
    };
    expect(hashBrowserPayload(left)).toBe(hashBrowserPayload(right));
    expect(serializeCanonicalPayload(left)).toBe(serializeCanonicalPayload(right));
  });

  it("changes when the payload content changes", () => {
    expect(hashBrowserPayload({ text: "one" })).not.toBe(
      hashBrowserPayload({ text: "two" }),
    );
    expect(hashBrowserPayload({ kind: "ref", ref: "a" })).not.toBe(
      hashBrowserPayload({ kind: "selector", selector: "a" }),
    );
  });

  it("does not leak secrets into the hash string itself", () => {
    const hash = hashBrowserPayload({
      password: "hunter2",
      token: "access_token=SECRET",
    });
    expect(hash).not.toContain("hunter2");
    expect(hash).not.toContain("SECRET");
    expect(hash).not.toContain("password");
  });

  it("rejects non-JSON-safe values instead of inventing a hash", () => {
    expect(() => hashBrowserPayload({ bad: Number.NaN })).toThrow(/canonical/i);
    expect(() => hashBrowserPayload({ bad: Number.POSITIVE_INFINITY })).toThrow(
      /canonical/i,
    );
    expect(() => hashBrowserPayload({ bad: 1n as unknown as number })).toThrow(
      /canonical/i,
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => hashBrowserPayload(cyclic)).toThrow(/canonical/i);
  });
});
