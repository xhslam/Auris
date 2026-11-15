import { describe, expect, it } from "vitest";
import { isNotesMcpDocumentEditCurrent, type NotesMcpPendingEdit } from "@/features/notes/workbench/notes-mcp-edit-review";
import { createNotesMcpRevision } from "@/features/notes/workbench/notes-mcp-contract";

const edit: Extract<NotesMcpPendingEdit, { kind: "document" }> = {
  kind: "document", id: "diagram-1", createdAt: "now", mode: "source", path: "A.md",
  beforeSource: "# A\nbody", afterSource: "---\naurisMermaid: graph TD\n---\n# A\nbody",
  expectedRevision: createNotesMcpRevision("# A\nbody"),
};
describe("pending document approval", () => {
  it("accepts only the original source and matching revision", () => {
    expect(isNotesMcpDocumentEditCurrent(edit, { path: "A.md", rawSource: edit.beforeSource })).toBe(true);
    expect(isNotesMcpDocumentEditCurrent({ ...edit, expectedRevision: "old" }, { path: "A.md", rawSource: edit.beforeSource })).toBe(false);
  });
  it("refuses a changed, renamed or closed document", () => {
    expect(isNotesMcpDocumentEditCurrent(edit, { path: "A.md", rawSource: "# A\nnew body" })).toBe(false);
    expect(isNotesMcpDocumentEditCurrent(edit, { path: "B.md", rawSource: edit.beforeSource })).toBe(false);
    expect(isNotesMcpDocumentEditCurrent(edit, undefined)).toBe(false);
  });
});
