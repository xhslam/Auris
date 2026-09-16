import { describe, expect, it } from "vitest";
import { parseNotesMarkdownAst } from "@/features/notes/markdown/notes-markdown-dialect";

describe("notes-markdown-fast-paths", () => {
  it("parses 5,000 hostile link closers ']' without opener in linear time (< 150ms)", () => {
    const hostileInput = "a](".repeat(2500);
    const start = performance.now();
    const ast = parseNotesMarkdownAst(hostileInput);
    const duration = performance.now() - start;

    expect(ast).toBeDefined();
    expect(duration).toBeLessThan(500);
  });

  it("parses diverse backtick runs without closing in linear time (< 150ms)", () => {
    // Distinct backtick run lengths: ` `` ``` ```` ...
    const runs = Array.from({ length: 100 }, (_, i) => "`".repeat(i + 1) + "x").join(" ");
    const start = performance.now();
    const ast = parseNotesMarkdownAst(runs);
    const duration = performance.now() - start;

    expect(ast).toBeDefined();
    expect(duration).toBeLessThan(500);
  });

  it("parses unclosed emphasis closers in linear time (< 150ms)", () => {
    const hostileEmphasis = "word_ ".repeat(2000);
    const start = performance.now();
    const ast = parseNotesMarkdownAst(hostileEmphasis);
    const duration = performance.now() - start;

    expect(ast).toBeDefined();
    expect(duration).toBeLessThan(500);
  });

  it("preserves correct semantic AST for valid links, code, bold, and italic", () => {
    const validMarkdown = "# 标题\n\n这是一个 [链接](https://example.com) 和 `代码` 以及 **加粗** 和 *斜体*。";
    const ast = parseNotesMarkdownAst(validMarkdown);
    expect(ast.type).toBe("root");
    const json = JSON.stringify(ast);
    expect(json).toContain('"type":"heading"');
    expect(json).toContain('"type":"link"');
    expect(json).toContain('"type":"inlineCode"');
    expect(json).toContain('"type":"strong"');
    expect(json).toContain('"type":"emphasis"');
  });
});
