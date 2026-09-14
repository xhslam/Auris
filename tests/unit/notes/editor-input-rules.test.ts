import { describe, expect, it } from "vitest";
import { getMarkdownContinuation } from "@/features/notes/editor/editor-input-rules";

describe("editor-input-rules", () => {
  it("continues unordered lists, tasks, quotes, and ordered lists like Obsidian source mode", () => {
    expect(getMarkdownContinuation("- Drill the phrase")).toBe("\n- ");
    expect(getMarkdownContinuation("- [ ] Shadow the sentence")).toBe("\n- [ ] ");
    expect(getMarkdownContinuation("> Keep the airflow steady")).toBe("\n> ");
    expect(getMarkdownContinuation("1. Warm up")).toBe("\n2. ");
  });

  it("exits empty list, task, and quote containers instead of nesting forever", () => {
    expect(getMarkdownContinuation("- ")).toBe("\n");
    expect(getMarkdownContinuation("- [ ] ")).toBe("\n");
    expect(getMarkdownContinuation("> ")).toBe("\n");
  });

  it("continues an Obsidian callout body with quote markers", () => {
    expect(getMarkdownContinuation("> [!note] Pronunciation cue")).toBe("\n> ");
    expect(getMarkdownContinuation("> Supporting detail")).toBe("\n> ");
  });
});
