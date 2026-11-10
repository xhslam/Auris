import { describe, expect, it } from "vitest";
import { getContentMermaid, writeContentMermaid, createContentMermaidPrompt } from "@/features/notes/graph/content-mermaid";

describe("article Mermaid", () => {
  it.each(["# 中文\n\n正文\n", "\uFEFF---\r\ntags: [学习]\r\n---\r\n# 中文\r\n正文\r\n"])("stores separately without changing body bytes", (source) => {
    const updated = writeContentMermaid(source, "flowchart LR\n A[\"学习\"] --> B[\"实践\"]");
    expect(updated.endsWith(source.includes("---") ? "# 中文\r\n正文\r\n" : source)).toBe(true);
    expect(getContentMermaid(updated)).toMatchObject({ stale: false, diagrams: [expect.stringContaining("学习")] });
    expect(getContentMermaid(updated.replace("正文", "新正文")).stale).toBe(true);
  });
  it("updates the same region, retains metadata and never duplicates the graph", () => {
    const initial = "---\ntitle: Test\n# keep me\ntags: [one]\n---\n# Body\n";
    const updated = writeContentMermaid(writeContentMermaid(initial, "graph TD\n A --> B"), "graph LR\n C --> D");
    expect(updated).toContain("# keep me");
    expect(updated).toMatch(/tags: \[\s*one\s*\]/);
    expect(updated.match(/^aurisMermaid:/gm)).toHaveLength(1);
    expect(getContentMermaid(updated).diagrams).toEqual(["graph LR\n C --> D"]);
  });
  it("finds real fenced diagrams, not fenced Markdown examples", () => {
    const source = "````md\n```mermaid\ngraph TD\n X --> Y\n```\n````\n\n~~~mermaid\ngraph LR\n A --> B\n~~~";
    expect(getContentMermaid(source).diagrams).toEqual(["graph LR\n A --> B"]);
  });
  it("accepts one fenced payload but rejects empty, oversized and configuration directives", () => {
    expect(getContentMermaid(writeContentMermaid("# A", "```mermaid\ngraph LR\n A --> B\n```" )).diagrams).toEqual(["graph LR\n A --> B"]);
    for (const value of ["", "x".repeat(50_001), 'flowchart LR\n A@{img: "https://example.com/track.png"}', "%%{init: {securityLevel: 'loose'}}%%\ngraph TD\n A --> B"]) {
      expect(() => writeContentMermaid("# A", value)).toThrow();
    }
  });
  it("refuses malformed frontmatter rather than discarding it", () => {
    expect(() => writeContentMermaid("---\ntags: [\n---\nbody", "graph TD\n A --> B")).toThrow();
  });
  it("provides a path-pinned read, write_mermaid, approval and save handoff", () => {
    const prompt = createContentMermaidPrompt("学习/微积分.md");
    for (const text of ["学习/微积分.md", "auris_document", "write_mermaid", "expected_revision", "auris_workspace", "save", "审批"]) expect(prompt).toContain(text);
  });
});
