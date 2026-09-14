import type { NotePageSummary, NotesStorage } from "@/features/notes/note-types";
import type { HomeLearningNoteSummary } from "@/features/home-learning/home-learning.types";

function isMarkdownNote(note: NotePageSummary): boolean {
  return note.relativePath.toLowerCase().endsWith(".md");
}

export function getHomeLearningNoteSummary({
  notes,
}: {
  notes: NotePageSummary[];
}): HomeLearningNoteSummary {
  const markdownNotes = notes
    .filter(isMarkdownNote)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return {
    status: markdownNotes.length ? "ready" : "empty",
    note: markdownNotes[0] ?? null,
  };
}

export async function loadHomeLearningNoteSummary(
  notesStorage: NotesStorage | null,
): Promise<HomeLearningNoteSummary> {
  if (!notesStorage) return { status: "unavailable", note: null };

  try {
    const directoryInfo = await notesStorage.getDirectoryInfo();
    if (!directoryInfo.isConfigured) {
      return { status: "unavailable", note: null };
    }

    return getHomeLearningNoteSummary({ notes: await notesStorage.listPages() });
  } catch {
    return { status: "unavailable", note: null };
  }
}
