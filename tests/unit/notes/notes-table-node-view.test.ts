import { describe, expect, it } from "vitest";
import { NotesTableScrollNodeView } from "@/features/notes/editor/notes-table-node-view";
import { parseNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";

function createTable() {
  return parseNotesRichMarkdown("| Header |\n| --- |\n| Body |").firstChild!;
}

function mutation(type: MutationRecordType, target: Node): MutationRecord {
  return {
    type,
    target,
    addedNodes: document.createDocumentFragment().childNodes,
    removedNodes: document.createDocumentFragment().childNodes,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  };
}

describe("NotesTableScrollNodeView", () => {
  it("lets ProseMirror observe cell text and selection while ignoring layout-only attributes", () => {
    const view = new NotesTableScrollNodeView(createTable());
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const text = document.createTextNode("Body");
    cell.appendChild(text);
    row.appendChild(cell);
    view.contentDOM.appendChild(row);

    expect(view.ignoreMutation({ type: "selection", target: text })).toBe(false);
    expect(view.ignoreMutation(mutation("characterData", text))).toBe(false);
    expect(view.ignoreMutation(mutation("attributes", view.table))).toBe(true);
    expect(view.ignoreMutation(mutation("attributes", cell))).toBe(false);
  });

  it("keeps the content DOM and horizontal scroll position when a table transaction updates cells", () => {
    const view = new NotesTableScrollNodeView(createTable());
    const originalContentDOM = view.contentDOM;
    view.dom.scrollLeft = 140;
    const edited = parseNotesRichMarkdown("| Header |\n| --- |\n| Edited |").firstChild!;

    expect(view.update(edited)).toBe(true);
    expect(view.contentDOM).toBe(originalContentDOM);
    expect(view.dom.scrollLeft).toBe(140);
    expect(view.update(parseNotesRichMarkdown("A paragraph").firstChild!)).toBe(false);
  });
});
