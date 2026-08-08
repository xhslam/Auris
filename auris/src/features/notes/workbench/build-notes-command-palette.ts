import type { NotesCommandPaletteItem } from "@/components/notes-v2/notes-command-palette";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type BuildNotesCommandPaletteInput = {
  documents: NoteDocument[];
  onCreateNote: () => void;
  onDeleteActiveNote: () => void;
  onExportVault: () => void;
  onFormatCjk: () => void;
  onOpenPath: (path: string) => void;
  onRecordCommand: (commandId: string, action: () => void) => void;
  onRefresh: () => void;
  onRenameActiveNote: () => void;
  onSaveActiveNote?: () => void;
  onSaveAllNotes?: () => void;
  recentFiles: string[];
};

function findDocumentByPath(documents: NoteDocument[], path: string) {
  return documents.find((document) => document.path === path) ?? null;
}

export function buildNotesCommandPalette(
  input: BuildNotesCommandPaletteInput,
): NotesCommandPaletteItem[] {
  return [
    {
      id: "new-note",
      keywords: [...NOTES_UI_COPY.commands.newNote.keywords],
      onSelect: () => input.onRecordCommand("new-note", input.onCreateNote),
      subtitle: NOTES_UI_COPY.commands.newNote.subtitle,
      title: NOTES_UI_COPY.commands.newNote.title,
    },
    {
      id: "rename-note",
      keywords: [...NOTES_UI_COPY.commands.renameNote.keywords],
      onSelect: () =>
        input.onRecordCommand("rename-note", input.onRenameActiveNote),
      subtitle: NOTES_UI_COPY.commands.renameNote.subtitle,
      title: NOTES_UI_COPY.commands.renameNote.title,
    },
    {
      id: "save-note",
      keywords: [...NOTES_UI_COPY.commands.saveNote.keywords],
      onSelect: () =>
        input.onRecordCommand("save-note", () => input.onSaveActiveNote?.()),
      subtitle: NOTES_UI_COPY.commands.saveNote.subtitle,
      title: NOTES_UI_COPY.commands.saveNote.title,
    },
    {
      id: "save-all-notes",
      keywords: [...NOTES_UI_COPY.commands.saveAllNotes.keywords],
      onSelect: () =>
        input.onRecordCommand("save-all-notes", () => input.onSaveAllNotes?.()),
      subtitle: NOTES_UI_COPY.commands.saveAllNotes.subtitle,
      title: NOTES_UI_COPY.commands.saveAllNotes.title,
    },
    {
      id: "delete-note",
      keywords: [...NOTES_UI_COPY.commands.deleteNote.keywords],
      onSelect: () =>
        input.onRecordCommand("delete-note", input.onDeleteActiveNote),
      subtitle: NOTES_UI_COPY.commands.deleteNote.subtitle,
      title: NOTES_UI_COPY.commands.deleteNote.title,
    },
    {
      id: "refresh-vault",
      keywords: [...NOTES_UI_COPY.commands.refreshVault.keywords],
      onSelect: () => input.onRecordCommand("refresh-vault", input.onRefresh),
      subtitle: NOTES_UI_COPY.commands.refreshVault.subtitle,
      title: NOTES_UI_COPY.commands.refreshVault.title,
    },
    {
      id: "export-vault",
      keywords: [...NOTES_UI_COPY.commands.exportVault.keywords],
      onSelect: () => input.onRecordCommand("export-vault", input.onExportVault),
      subtitle: NOTES_UI_COPY.commands.exportVault.subtitle,
      title: NOTES_UI_COPY.commands.exportVault.title,
    },
    {
      id: "format-cjk",
      keywords: [...NOTES_UI_COPY.commands.formatCjk.keywords],
      onSelect: () => input.onRecordCommand("format-cjk", input.onFormatCjk),
      subtitle: NOTES_UI_COPY.commands.formatCjk.subtitle,
      title: NOTES_UI_COPY.commands.formatCjk.title,
    },
    ...input.recentFiles
      .map((path) => findDocumentByPath(input.documents, path))
      .filter((document): document is NoteDocument => document !== null)
      .map((document) => ({
        id: `recent:${document.path}`,
        keywords: [
          NOTES_UI_COPY.commands.openRecentPrefix,
          "recent",
          document.fileName,
          ...document.parsed.tags,
        ],
        onSelect: () =>
          input.onRecordCommand(`recent:${document.path}`, () =>
            input.onOpenPath(document.path),
          ),
        subtitle: document.path,
        title: `${NOTES_UI_COPY.commands.openRecentPrefix}${document.parsed.title ?? document.fileName}`,
      })),
    ...input.documents.map((document) => ({
      id: `open:${document.path}`,
      keywords: [document.fileName, ...document.parsed.tags],
      onSelect: () =>
        input.onRecordCommand(`open:${document.path}`, () =>
          input.onOpenPath(document.path),
        ),
      subtitle: document.path,
      title: document.parsed.title ?? document.fileName,
    })),
  ];
}
