import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { buildNotesCommandPalette } from "@/features/notes/workbench/build-notes-command-palette";

function createDocument(
  path: string,
  title: string,
  tags: string[] = [],
): NoteDocument {
  return {
    basename: title.toLowerCase().replace(/\s+/g, "-"),
    fileName: `${title.toLowerCase().replace(/\s+/g, "-")}.md`,
    frontmatter: {},
    mtime: "2026-04-19T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags,
      tasks: [],
      title,
      wordCount: 10,
    },
    path,
    rawSource: `# ${title}`,
  };
}

describe("buildNotesCommandPalette", () => {
  it("builds the built-in workbench commands in front of document shortcuts", () => {
    const items = buildNotesCommandPalette({
      documents: [createDocument("notes/daily.md", "Daily Review")],
      onCreateNote: vi.fn(),
      onDeleteActiveNote: vi.fn(),
      onExportVault: vi.fn(),
      onFormatCjk: vi.fn(),
      onOpenPath: vi.fn(),
      onRecordCommand: vi.fn((_, action: () => void) => action()),
      onRefresh: vi.fn(),
      onRenameActiveNote: vi.fn(),
      recentFiles: [],
    });

    expect(items.slice(0, 6).map((item) => item.id)).toEqual([
      "new-note",
      "rename-note",
      "save-note",
      "save-all-notes",
      "delete-note",
      "refresh-vault",
    ]);
    expect(items[0]?.title).toBe(NOTES_UI_COPY.commands.newNote.title);
    expect(items.some((item) => item.id === "toggle-reading")).toBe(false);
  });

  it("exposes a one-click CJK formatting command that dispatches onFormatCjk", () => {
    const onFormatCjk = vi.fn();
    const recordCommand = vi.fn((_: string, action: () => void) => action());
    const items = buildNotesCommandPalette({
      documents: [createDocument("notes/daily.md", "Daily Review")],
      onCreateNote: vi.fn(),
      onDeleteActiveNote: vi.fn(),
      onExportVault: vi.fn(),
      onFormatCjk,
      onOpenPath: vi.fn(),
      onRecordCommand: recordCommand,
      onRefresh: vi.fn(),
      onRenameActiveNote: vi.fn(),
      recentFiles: [],
    });

    const formatItem = items.find((item) => item.id === "format-cjk");
    expect(formatItem?.title).toBe(NOTES_UI_COPY.commands.formatCjk.title);

    formatItem?.onSelect();
    expect(recordCommand).toHaveBeenCalledWith("format-cjk", expect.any(Function));
    expect(onFormatCjk).toHaveBeenCalledTimes(1);
  });

  it("dispatches manual save commands through the command palette", () => {
    const onSaveActiveNote = vi.fn();
    const onSaveAllNotes = vi.fn();
    const recordCommand = vi.fn((_: string, action: () => void) => action());
    const items = buildNotesCommandPalette({
      documents: [createDocument("notes/daily.md", "Daily Review")],
      onCreateNote: vi.fn(),
      onDeleteActiveNote: vi.fn(),
      onExportVault: vi.fn(),
      onFormatCjk: vi.fn(),
      onOpenPath: vi.fn(),
      onRecordCommand: recordCommand,
      onRefresh: vi.fn(),
      onRenameActiveNote: vi.fn(),
      onSaveActiveNote,
      onSaveAllNotes,
      recentFiles: [],
    });

    items.find((item) => item.id === "save-note")?.onSelect();
    items.find((item) => item.id === "save-all-notes")?.onSelect();

    expect(recordCommand).toHaveBeenCalledWith("save-note", expect.any(Function));
    expect(recordCommand).toHaveBeenCalledWith(
      "save-all-notes",
      expect.any(Function),
    );
    expect(onSaveActiveNote).toHaveBeenCalledTimes(1);
    expect(onSaveAllNotes).toHaveBeenCalledTimes(1);
  });

  it("creates recent-file shortcuts before the full document list and skips missing paths", () => {
    const daily = createDocument("notes/daily.md", "Daily Review", ["shadowing"]);
    const grammar = createDocument("notes/grammar.md", "Grammar Review", ["grammar"]);

    const items = buildNotesCommandPalette({
      documents: [daily, grammar],
      onCreateNote: vi.fn(),
      onDeleteActiveNote: vi.fn(),
      onExportVault: vi.fn(),
      onFormatCjk: vi.fn(),
      onOpenPath: vi.fn(),
      onRecordCommand: vi.fn((_, action: () => void) => action()),
      onRefresh: vi.fn(),
      onRenameActiveNote: vi.fn(),
      recentFiles: ["notes/grammar.md", "notes/missing.md"],
    });

    const recentItem = items.find((item) => item.id === "recent:notes/grammar.md");
    const openDailyItem = items.find((item) => item.id === "open:notes/daily.md");

    expect(recentItem).toBeDefined();
    expect(recentItem?.title).toContain("Grammar Review");
    expect(recentItem?.keywords).toEqual(
      expect.arrayContaining([
        NOTES_UI_COPY.commands.openRecentPrefix,
        "recent",
        grammar.fileName,
        "grammar",
      ]),
    );
    expect(openDailyItem?.title).toBe("Daily Review");
    expect(items.some((item) => item.id === "recent:notes/missing.md")).toBe(false);
  });

  it("records the command id and dispatches the matching action when an item is selected", () => {
    const openPath = vi.fn();
    const recordCommand = vi.fn((_: string, action: () => void) => action());
    const items = buildNotesCommandPalette({
      documents: [createDocument("notes/daily.md", "Daily Review")],
      onCreateNote: vi.fn(),
      onDeleteActiveNote: vi.fn(),
      onExportVault: vi.fn(),
      onFormatCjk: vi.fn(),
      onOpenPath: openPath,
      onRecordCommand: recordCommand,
      onRefresh: vi.fn(),
      onRenameActiveNote: vi.fn(),
      recentFiles: ["notes/daily.md"],
    });

    items.find((item) => item.id === "recent:notes/daily.md")?.onSelect();

    expect(recordCommand).toHaveBeenCalledWith(
      "recent:notes/daily.md",
      expect.any(Function),
    );
    expect(openPath).toHaveBeenCalledWith("notes/daily.md");
  });
});
