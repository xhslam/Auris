import { describe, expect, it } from "vitest";
import { buildMoveEntryPlan } from "@/features/notes/documents/move-entry-plan";

const existingPaths = [
  "Inbox",
  "Inbox/note.md",
  "Archive",
  "Archive/old.md",
  "journal",
  "journal/daily.md",
];

describe("buildMoveEntryPlan", () => {
  it("moves a file into a folder, keeping its name", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths,
        sourcePath: "Inbox/note.md",
        targetFolderPath: "Archive",
      }),
    ).toEqual({ nextPath: "Archive/note.md", type: "move" });
  });

  it("moves a file to the vault root when the target folder is empty", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths,
        sourcePath: "Inbox/note.md",
        targetFolderPath: "",
      }),
    ).toEqual({ nextPath: "note.md", type: "move" });
  });

  it("moves a whole folder into another folder", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths,
        sourcePath: "journal",
        targetFolderPath: "Archive",
      }),
    ).toEqual({ nextPath: "Archive/journal", type: "move" });
  });

  it("is a no-op when the entry already lives in the target folder", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths,
        sourcePath: "Inbox/note.md",
        targetFolderPath: "Inbox",
      }),
    ).toEqual({ type: "noop" });
  });

  it("rejects moving a folder into itself or a descendant", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths,
        sourcePath: "journal",
        targetFolderPath: "journal",
      }),
    ).toEqual({ reason: "into-self", type: "invalid" });

    expect(
      buildMoveEntryPlan({
        existingPaths: [...existingPaths, "journal/2026"],
        sourcePath: "journal",
        targetFolderPath: "journal/2026",
      }),
    ).toEqual({ reason: "into-self", type: "invalid" });
  });

  it("rejects a move that would collide with an existing name", () => {
    expect(
      buildMoveEntryPlan({
        existingPaths: [...existingPaths, "Archive/note.md"],
        sourcePath: "Inbox/note.md",
        targetFolderPath: "Archive",
      }),
    ).toEqual({ reason: "collision", type: "invalid" });
  });
});
