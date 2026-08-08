import { describe, expect, it } from "vitest";

import {
  createBrowserReferenceContext,
  createNotesDocumentContext,
  createNotesSelectionContext,
  createWorkflowStepContext,
  formatNiaContextForPrompt,
  validateNiaApplyProposal,
} from "@/features/nia/nia-context";

describe("Nia explicit context", () => {
  it("captures only an explicit non-empty selection with path and revision", () => {
    expect(createNotesSelectionContext({ path: "a.md", source: "hello", selection: null })).toBeNull();
    const context = createNotesSelectionContext({
      path: "a.md",
      source: "hello world",
      selection: { from: 0, to: 5, line: 0, text: "hello" },
    });
    expect(context).toMatchObject({ kind: "notes_selection", text: "hello" });
    expect(context?.revision).toMatch(/^sha256-/u);
    expect(formatNiaContextForPrompt(context!)).toContain("Explicit note selection");
  });

  it("bounds whole-document context and strips URL credentials", () => {
    expect(() => createNotesDocumentContext({ path: "a.md", source: "x".repeat(32_001) })).toThrow(
      /exceeds/u,
    );
    const browser = createBrowserReferenceContext({
      title: "Example",
      url: "https://user:pass@example.com/path",
    });
    expect(browser.url).toBe("https://example.com/path");
    expect(JSON.stringify(browser)).not.toContain("pass");
    expect(() => createBrowserReferenceContext({ url: "file:///tmp/secret" })).toThrow();
  });

  it("labels bounded workflow-step input and output without granting ambient context", () => {
    const context = createWorkflowStepContext({
      runId: "run-1",
      stepId: "draft",
      text: "typed step output",
    });
    expect(context).toMatchObject({
      kind: "workflow_step",
      provenance: "workflow_step",
      text: "typed step output",
    });
    expect(formatNiaContextForPrompt(context)).toContain("run-1/draft");
    expect(() => createWorkflowStepContext({
      runId: "run-1",
      stepId: "oversized",
      text: "x".repeat(32_001),
    })).toThrow(/exceeds/u);
  });

  it("stops stale document and selection proposals before applying", () => {
    const selection = { from: 0, to: 5, line: 0, text: "hello" };
    const context = createNotesSelectionContext({ path: "a.md", source: "hello", selection })!;
    const proposal = { content: "hi", context, mode: "replace_selection" as const };
    expect(validateNiaApplyProposal(proposal, { path: "a.md", source: "hello", selection }).ok).toBe(true);
    expect(validateNiaApplyProposal(proposal, { path: "a.md", source: "changed", selection }).ok).toBe(false);
    expect(validateNiaApplyProposal(proposal, {
      path: "a.md",
      source: "hello",
      selection: { ...selection, to: 4 },
    }).ok).toBe(false);
  });
});
