import { describe, expect, it, vi } from "vitest";
import { createInertNotesHtmlContainer } from "@/features/notes/editor/notes-inert-html";
import { parseNotesRichMarkdown, serializeNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";

describe("inert Notes import", () => {
  it("owns parsed nodes in a document without a browsing context", () => {
    const container = createInertNotesHtmlContainer('<b>text</b><img src="https://example.com/image">');
    expect(container.ownerDocument).not.toBe(document);
    expect(container.ownerDocument.defaultView).toBeNull();
    expect(container.querySelector("img")?.ownerDocument).toBe(container.ownerDocument);
  });

  it("uses the inert document for the actual Markdown importer", () => {
    const spy = vi.spyOn(window.DOMParser.prototype, "parseFromString");
    try {
      const source = "![image](https://example.com/image)";
      expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(source))).toBe(source);
      expect(spy).toHaveBeenCalledWith("", "text/html");
    } finally {
      spy.mockRestore();
    }
  });
});
