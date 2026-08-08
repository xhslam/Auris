import { describe, expect, it } from "vitest";
import { getNotesDocumentSaveState } from "@/features/notes/workbench/notes-document-save-state";

describe("notes document save state", () => {
  it("reports the active note's saving lifecycle without leaking another note's state", () => {
    expect(
      getNotesDocumentSaveState({
        activePath: "alpha.md",
        dirtyPaths: { "beta.md": true },
        writeConflictPath: null,
      }),
    ).toBe("saved");

    expect(
      getNotesDocumentSaveState({
        activePath: "alpha.md",
        dirtyPaths: { "alpha.md": true },
        writeConflictPath: null,
      }),
    ).toBe("saving");

    expect(
      getNotesDocumentSaveState({
        activePath: "alpha.md",
        dirtyPaths: { "alpha.md": true },
        writeConflictPath: "alpha.md",
      }),
    ).toBe("conflict");
  });
});
