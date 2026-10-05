import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNotesRichMarkdown, serializeNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";
import { createNotesRichMathPastePlugin, notesRichEditorSchema } from "@/features/notes/editor/notes-rich-markdown";
import { Fragment, Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { findNotesMathDelimiterSpans, normalizeNotesMathDelimiters, sanitizeMathContent } from "@/features/notes/markdown/notes-markdown-dialect";

describe("real lead compensation note math", () => {
  it.each([
    String.raw`$\begin{pmatrix}1 & 2 \\[4pt] 3 & 4\end{pmatrix}$`,
    String.raw`$\text{\$5} + x$`,
    String.raw`$\text{file\_name}$`,
    "> 1. 式子\n>\n>    $$\n>    x = 1\n>    $$",
    "1. 式子\n\n   $$\n   x = 1\n   $$",
  ])("keeps valid math stable across repeated saves: %s", source => {
    const saved = serializeNotesRichMarkdown(parseNotesRichMarkdown(source));
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(saved))).toBe(saved);
    expect(renderMarkdown(saved).includes("katex-error")).toBe(false);
  });

  it("does not rewrite literal/code/frontmatter/HTML/link/reference/currency contexts", () => {
    const source = String.raw`---
example: '\\[x=1\\]'
---

> ~~~md
> \\[x=1\\]
> ~~~

- code:

      \\[x=1\\]

<div data-example="\\[x=1\\]">
\\[x=1\\]
</div>

[link](relative/\\(x\\))

[ref]: relative/\\(x\\)

${"`"}$\\omega\_m$${"`"} costs $100 and $200. Escaped \$x\$ and \$$x\$$.`;
    expect(normalizeNotesMathDelimiters(source)).toBe(source);
    expect(findNotesMathDelimiterSpans(source)).toEqual([]);
  });

  it("normalizes damaged TeX once while retaining matrix rows and spacing", () => {
    const value = String.raw`\\\\omega\\\_m + \begin{matrix}1 & 2 \\[4pt] 3 & 4\end{matrix}`;
    const cleaned = sanitizeMathContent(value);
    expect(cleaned).toContain(String.raw`\omega_m`);
    expect(cleaned).toContain(String.raw`\\[4pt]`);
    expect(sanitizeMathContent(cleaned)).toBe(cleaned);
  });

  it.each(["text", "html"])("pastes %s math through the actual editor without escape accumulation", format => {
    const view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema: notesRichEditorSchema, plugins: [createNotesRichMathPastePlugin(notesRichEditorSchema)] }),
    });
    const pasteEvent = new Event("paste") as ClipboardEvent;
    if (format === "html") view.pasteHTML(String.raw`<p><strong>公式</strong> $G_c(s) = \frac{1}{s}$</p><p>$$\omega_m = \frac{1}{T\sqrt{a}}$$</p>`, pasteEvent);
    else view.pasteText(String.raw`公式 $G_c(s) = \frac{1}{s}$` + "\n\n$$\n" + String.raw`\omega_m = \frac{1}{T\sqrt{a}}` + "\n$$", pasteEvent);
    const math: string[] = [];
    view.state.doc.descendants(node => { if (node.type.name.startsWith("math_")) math.push(node.type.name); });
    expect(math).toEqual(["math_inline", "math_block"]);
    const saved = serializeNotesRichMarkdown(view.state.doc);
    expect(saved).toContain(String.raw`$G_c(s) = \frac{1}{s}$`);
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(saved))).toBe(saved);
    expect(() => view.state.doc.check()).not.toThrow();
    view.destroy();
  });

  it("keeps a block formula pasted as the first list item structurally valid", () => {
    const view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema: notesRichEditorSchema, plugins: [createNotesRichMathPastePlugin(notesRichEditorSchema)] }),
    });
    view.pasteHTML("<ul><li>$$x=1$$</li></ul>", new Event("paste") as ClipboardEvent);
    expect(() => view.state.doc.check()).not.toThrow();
    expect(serializeNotesRichMarkdown(view.state.doc)).toContain("x=1");
    view.destroy();
  });
  it("converts rich HTML dollar formulas before save can double their escapes", () => {
    const schema = notesRichEditorSchema;
    const view = new EditorView(document.createElement("div"), { state: EditorState.create({ schema }) });
    const plugin = createNotesRichMathPastePlugin(schema);
    const input = new Slice(Fragment.from(schema.nodes.paragraph.create(null, [
      schema.text("求 "), schema.text(String.raw`$G_c(s) = \frac{1}{s}$`, [schema.marks.strong.create()]),
      schema.text(String.raw`，显示： $$\omega_m = \frac{1}{T\sqrt{a}}$$ 结束`),
    ])), 0, 0);
    const output = plugin.props.transformPasted!.call(plugin, input, view, false);
    const math: string[] = [];
    output.content.descendants(node => { if (node.type.name.startsWith("math_")) math.push(node.type.name); });
    expect(math).toEqual(["math_inline", "math_block"]);
    expect(output.content.child(0).child(1).marks[0].type.name).toBe("strong");
    expect(output.content.toString()).toContain("结束");
    expect(() => schema.nodes.doc.create(null, output.content).check()).not.toThrow();
    view.destroy();
  });
  it("recognizes ordinary dollar math before any corruption repair", () => {
    const doc = parseNotesRichMarkdown("求开环增益 $K$，相角 $\\varphi_m$。");
    const math: string[] = [];
    doc.descendants(node => { if (node.type.name === "math_inline") math.push(node.attrs.content); });
    expect(math).toEqual(["K", "\\varphi_m"]);
  });

  it("renders and stabilizes the user's overescaped note", () => {
    const source = readFileSync("tests/fixtures/notes/math/overescaped-lead-compensation.md", "utf8");
    const doc = parseNotesRichMarkdown(source);
    const math: string[] = [];
    doc.descendants(node => { if (node.type.name.startsWith("math_")) math.push(node.attrs.content); });
    expect(math.length).toBeGreaterThan(30);
    expect(math).toContain(String.raw`G_c(s) = \frac{aTs+1}{Ts+1} \quad (a > 1)`);
    expect(math).toContain(String.raw`\omega_m`);
    expect(renderMarkdown(source)).not.toContain("katex-error");
    expect(renderMarkdown(source).match(/class="katex"/gu)?.length).toBe(math.length);
    const saved = serializeNotesRichMarkdown(doc);
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(saved))).toBe(saved);
    const repaired = normalizeNotesMathDelimiters(source);
    expect(normalizeNotesMathDelimiters(repaired)).toBe(repaired);
    expect(repaired).not.toContain(String.raw`\\\\frac`);
    expect(repaired).not.toContain(String.raw`\\\_`);
  });
});
