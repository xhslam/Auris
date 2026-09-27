import { describe, expect, it } from "vitest";
import {
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import { findNotesRichLinkMarkRange } from "@/features/notes/editor/notes-rich-link-range";

describe("rich editor link mark ranges", () => {
  it("includes an inline image inside the surrounding link mark", () => {
    const doc = parseNotesRichMarkdown("before [![image](pic.png) caption](A.md) after");
    let imagePosition = -1;
    let imageHref: unknown = null;

    doc.descendants((node, position) => {
      if (node.type.name !== "image") return;
      imagePosition = position;
      imageHref = node.marks.find((mark) => mark.type.name === "link")?.attrs.href;
    });

    expect(imageHref).toBe("A.md");
    const range = findNotesRichLinkMarkRange(doc, imagePosition);
    expect(range?.mark.attrs.href).toBe("A.md");
    expect(range?.from).toBeLessThanOrEqual(imagePosition);
    expect(range?.to).toBeGreaterThan(imagePosition);
  });

  it("keeps adjacent links with different targets in separate ranges", () => {
    const doc = parseNotesRichMarkdown("[one](A.md)[two](B.md)");
    let firstPosition = -1;
    let secondPosition = -1;
    doc.descendants((node, position) => {
      if (!node.isText) return;
      if (node.text === "one") firstPosition = position;
      if (node.text === "two") secondPosition = position;
    });

    expect(findNotesRichLinkMarkRange(doc, firstPosition)?.mark.attrs.href).toBe("A.md");
    expect(findNotesRichLinkMarkRange(doc, secondPosition)?.mark.attrs.href).toBe("B.md");
  });

  it("round-trips links around images without dropping their href", () => {
    const source = "[![image](pic.png)](A.md)";
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(source))).toBe(source);
  });
});
