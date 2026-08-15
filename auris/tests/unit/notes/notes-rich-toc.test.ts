import { describe, expect, it } from "vitest";
import {
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

describe("notes rich markdown table of contents", () => {
  it("parses a standalone VMark [TOC] marker as a semantic block atom", () => {
    const document = parseNotesRichMarkdown(
      "# Study plan\n\n[TOC]\n\n## Listening\n\nPractice daily.",
    );
    const nodes: string[] = [];
    document.descendants((node) => {
      nodes.push(node.type.name);
    });
    expect(nodes).toContain("toc");
  });

  it("round-trips the marker without converting it into ordinary text", () => {
    const source = "# Study plan\n\n[TOC]\n\n## Listening\n";
    const parsed = parseNotesRichMarkdown(source);
    expect(serializeNotesRichMarkdown(parsed)).toBe(source.trimEnd());
  });

  it("does not treat an inline [TOC] mention as a generated navigator", () => {
    const parsed = parseNotesRichMarkdown("Keep [TOC] in an explanatory sentence.");
    let foundToc = false;
    parsed.descendants((node) => {
      foundToc ||= node.type.name === "toc";
    });
    expect(foundToc).toBe(false);
  });
});
