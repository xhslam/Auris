import { describe, expect, it } from "vitest";
import {
  createNotesMcpError,
  createNotesMcpRevision,
  parseVaultMarkdownPath,
  safeParseNotesMcpToolInput,
} from "@/features/notes/workbench/notes-mcp-contract";

describe("notes MCP contract", () => {
  const evidence = {
    approvals: [{
      action: "act",
      decision: "allow_once",
      operation: "click",
    }],
    citations: [{ draftRange: { end: 20, start: 3 }, sourceId: "source-1" }],
    excerpts: [{ sourceId: "source-1", text: "A bounded visible excerpt." }],
    refs: [{ generation: 3, ref: "e1" }],
    screenshots: [{ evidenceRef: `screenshot-${"a".repeat(32)}` }],
    source: {
      accessedAt: "2026-07-19T08:30:00.000Z",
      finalUrl: "https://example.com/report",
      origin: "https://example.com",
      title: "Research",
    },
    version: 1,
  } as const;

  it("accepts a vault-relative Markdown path", () => {
    expect(parseVaultMarkdownPath("Study/Daily Review.md")).toBe(
      "Study/Daily Review.md",
    );
  });

  it.each([
    "/Users/apple/Desktop/private.md",
    "../private.md",
    "Study/../private.md",
    "Study/daily.txt",
    "",
  ])("rejects a path outside the notes-vault contract: %s", (path) => {
    expect(() => parseVaultMarkdownPath(path)).toThrow(/vault-relative Markdown path/i);
  });

  it("creates a stable SHA-256 revision from Markdown source", () => {
    expect(createNotesMcpRevision("# Daily\n")).toBe(
      "sha256-b90ec0a7c1e985914e165e6069aaffadf2096af33087a97651acbc38e0618be7",
    );
  });

  it("returns an invalid-action result without coercing input", () => {
    expect(safeParseNotesMcpToolInput("auris_document", { action: "delete" })).toMatchObject({
      success: false,
    });
  });

  it("accepts optional bounded browser evidence only on a revision-safe document write", () => {
    expect(safeParseNotesMcpToolInput("auris_document", {
      action: "write",
      content: "# Draft",
      evidence,
      expected_revision: "sha256-current",
    })).toMatchObject({ success: true });
    expect(safeParseNotesMcpToolInput("auris_document", {
      action: "read",
      evidence,
    })).toMatchObject({ success: false });
  });

  it.each([
    { ...evidence, leaseToken: "lease_1234567890abcdef" },
    { ...evidence, lease_token: "lease_abcdef1234567890" },
    { ...evidence, excerpts: [{ sourceId: "source-1", text: "x".repeat(8_193) }] },
    { ...evidence, approvals: [{ ...evidence.approvals[0], payloadHash: "raw-hash" }] },
    { ...evidence, approvals: [{ ...evidence.approvals[0], typedValue: "hunter2" }] },
    { ...evidence, approvals: [{ ...evidence.approvals[0], decision: "approved" }] },
    { ...evidence, approvals: [{ ...evidence.approvals[0], operation: "arbitrary" }] },
    { ...evidence, screenshots: [{ ...evidence.screenshots[0], sessionId: "private" }] },
    { ...evidence, screenshots: [{ ...evidence.screenshots[0], keychainId: "profile-1" }] },
  ])("rejects unknown, oversized, or secret-bearing evidence", (unsafeEvidence) => {
    expect(safeParseNotesMcpToolInput("auris_document", {
      action: "write",
      content: "# Draft",
      evidence: unsafeEvidence,
      expected_revision: "sha256-current",
    })).toMatchObject({ success: false });
  });

  it("serializes stable domain errors without omitting current revision", () => {
    expect(
      createNotesMcpError("STALE", "The document changed.", "sha256-next"),
    ).toEqual({
      current_revision: "sha256-next",
      error: "STALE",
      message: "The document changed.",
    });
  });
});
