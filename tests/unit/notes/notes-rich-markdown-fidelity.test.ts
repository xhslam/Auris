import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { normalizeLanguage } from "@/features/notes/editor/code-block-preview";
import {
  parseNotesRichMarkdown,
  notesRichEditorSchema as schema,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

describe("VMark 0.9.92 rich Markdown fidelity", () => {
  it("preserves code-fence metadata after an unrelated prose edit", () => {
    const doc = parseNotesRichMarkdown('```ts title="demo.ts" {1,3}\nconst a = 1;\n```\n\n正文');
    expect(doc.firstChild?.attrs.params).toBe('ts title="demo.ts" {1,3}');
    const edited = EditorState.create({ doc }).tr.insertText("修改", doc.content.size - 1).doc;
    expect(serializeNotesRichMarkdown(edited)).toContain('```ts title="demo.ts" {1,3}');
  });

  it("still identifies preview languages when a fence has metadata", () => {
    const doc = parseNotesRichMarkdown('```mermaid title="flow"\ngraph TD; A-->B\n```');
    expect(normalizeLanguage(doc.firstChild?.attrs.params)).toBe("mermaid");
    expect(serializeNotesRichMarkdown(doc)).toContain('```mermaid title="flow"');
  });

  it.each([
    ["- one\n- two", true],
    ["- one\n\n- two", false],
    ["3. one\n4. two", true],
    ["3. one\n\n4. two", false],
  ])("preserves list spread semantics for %s", (source, tight) => {
    const doc = parseNotesRichMarkdown(source);
    expect(doc.firstChild?.attrs.tight).toBe(tight);
    expect(parseNotesRichMarkdown(serializeNotesRichMarkdown(doc)).toJSON()).toEqual(doc.toJSON());
  });

  it("keeps consecutive hard breaks at the end of a paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("a"), schema.node("hard_break"), schema.node("hard_break")]),
      schema.node("paragraph", null, schema.text("b")),
    ]);
    const output = serializeNotesRichMarkdown(doc);
    expect(parseNotesRichMarkdown(output).toJSON()).toEqual(doc.toJSON());
    expect(output).toContain("a<br><br>");
  });

  it.each([
    ["leading", [schema.node("hard_break"), schema.text("text")]],
    ["consecutive inside prose", [schema.text("a"), schema.node("hard_break"), schema.node("hard_break"), schema.text("b")]],
    ["final after emphasis", [schema.text("a", [schema.marks.em.create()]), schema.node("hard_break")]],
  ])("preserves %s hard breaks through serialization", (_name, content) => {
    const doc = schema.node("doc", null, schema.node("paragraph", null, content));
    expect(parseNotesRichMarkdown(serializeNotesRichMarkdown(doc)).toJSON()).toEqual(doc.toJSON());
  });
});
