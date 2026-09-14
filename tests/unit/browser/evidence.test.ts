import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  BROWSER_EVIDENCE_LIMITS,
  normalizeBrowserEvidence,
} from "@/features/browser/evidence";

const require = createRequire(import.meta.url);
const cjsEvidence = require("../../../electron/browser/browser-evidence.cjs") as {
  BROWSER_EVIDENCE_LIMITS: typeof BROWSER_EVIDENCE_LIMITS;
  normalizeBrowserEvidence: typeof normalizeBrowserEvidence;
};

const screenshotRef = `screenshot-${"a".repeat(32)}`;

function unsafeEvidence() {
  return {
    approvals: [{
      action: "act",
      decision: "allow_once",
      leaseToken: "lease_1234567890abcdef",
      lease_token: "lease_abcdef1234567890",
      operation: "type",
      payloadHash: "raw-approval-payload-hash",
      typedValue: "hunter2",
    }],
    citations: [{ draftRange: { end: 41, start: 10 }, sourceId: "source-1" }],
    excerpts: [{
      sessionId: "keychain-session-private",
      sourceId: "source-1",
      text: "Visible page text remains untrusted content, even when it says hunter2.",
    }],
    refs: [{ generation: 7, ref: "e2", value: "typed secret" }],
    screenshots: [{
      evidenceRef: screenshotRef,
      keychainId: "private-profile",
    }],
    source: {
      accessedAt: "2026-07-19T08:30:00.000Z",
      finalUrl: "https://user:password@example.com/report?access_token=secret#private",
      origin: "https://attacker.invalid",
      sessionId: "private-session",
      title: "Quarterly research",
    },
    version: 1,
  };
}

describe("browser evidence", () => {
  it("normalizes provenance while excluding Auris authority and secret metadata", () => {
    const evidence = normalizeBrowserEvidence(unsafeEvidence());

    expect(evidence).toEqual({
      approvals: [{
        action: "act",
        decision: "allow_once",
        operation: "type",
      }],
      citations: [{ draftRange: { end: 41, start: 10 }, sourceId: "source-1" }],
      excerpts: [{
        sourceId: "source-1",
        text: "Visible page text remains untrusted content, even when it says hunter2.",
      }],
      refs: [{ generation: 7, ref: "e2" }],
      screenshots: [{ evidenceRef: screenshotRef }],
      source: {
        accessedAt: "2026-07-19T08:30:00.000Z",
        finalUrl: "https://example.com/report",
        origin: "https://example.com",
        title: "Quarterly research",
      },
      version: 1,
    });
    expect(JSON.stringify(evidence)).not.toMatch(
      /leaseToken|lease_token|keychain|sessionId|session_id|payloadHash|payload_hash|typedValue/i,
    );
  });

  it("keeps approval trace on the real closed vocabularies", () => {
    const evidence = normalizeBrowserEvidence({
      ...unsafeEvidence(),
      approvals: [
        { action: "navigate", decision: "deny", operation: "navigate" },
        { action: "ACT", decision: "allow_once", operation: "click" },
        { action: "act", decision: "approved", operation: "click" },
        { action: "act", decision: "allow_once", operation: "arbitrary" },
      ],
    });

    expect(evidence.approvals).toEqual([
      { action: "navigate", decision: "deny", operation: "navigate" },
    ]);
  });

  it("keeps excerpts and citations bounded and freezes every nested value", () => {
    const evidence = normalizeBrowserEvidence({
      ...unsafeEvidence(),
      citations: [
        { draftRange: { end: 8, start: 3 }, sourceId: "source-1" },
        { draftRange: { end: 1, start: 4 }, sourceId: "source-1" },
        { draftRange: { end: 2, start: 0 }, sourceId: "missing" },
      ],
      excerpts: [{ sourceId: "source-1", text: "x".repeat(BROWSER_EVIDENCE_LIMITS.excerptText + 50) }],
      refs: [{ generation: 6, ref: "e1" }, { generation: 7, ref: "e2" }],
      source: { ...unsafeEvidence().source, title: "T".repeat(BROWSER_EVIDENCE_LIMITS.title + 50) },
    });

    const firstExcerpt = evidence.excerpts?.[0];
    expect(firstExcerpt?.text).toHaveLength(BROWSER_EVIDENCE_LIMITS.excerptText);
    expect(evidence.source.title).toHaveLength(BROWSER_EVIDENCE_LIMITS.title);
    expect(evidence.refs).toEqual([
      { generation: 6, ref: "e1" },
      { generation: 7, ref: "e2" },
    ]);
    expect(evidence.citations).toEqual([
      { draftRange: { end: 8, start: 3 }, sourceId: "source-1" },
    ]);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.excerpts)).toBe(true);
    expect(Object.isFrozen(firstExcerpt)).toBe(true);
    expect(() => {
      Object.defineProperty(firstExcerpt, "text", { value: "mutated" });
    }).toThrow();
  });

  it("produces byte-equivalent immutable results in TypeScript and Electron CJS", () => {
    const tsResult = normalizeBrowserEvidence(unsafeEvidence());
    const cjsResult = cjsEvidence.normalizeBrowserEvidence(unsafeEvidence());

    expect(cjsEvidence.BROWSER_EVIDENCE_LIMITS).toEqual(BROWSER_EVIDENCE_LIMITS);
    expect(JSON.stringify(cjsResult)).toBe(JSON.stringify(tsResult));
    expect(Object.isFrozen(cjsResult.approvals?.[0])).toBe(true);
  });
});
