export type NoteReviewStatus = "pending" | "reviewed" | "needs_practice" | "mastered";

export type NoteReviewItem = {
  id: string;
  noteId: string;
  noteTitle: string;
  noteRelativePath: string;
  scheduledDate: string;
  addedAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  status: NoteReviewStatus;
  inSpacedRepetition?: boolean;
  knowledgePointId?: string;
};

export type NoteReviewState = {
  version: 1;
  items: NoteReviewItem[];
};

export const EMPTY_NOTE_REVIEW_STATE: NoteReviewState = {
  version: 1,
  items: [],
};

export function addNotesToReview(
  state: NoteReviewState,
  notes: Array<{ id: string; title: string; relativePath: string }>,
  today: string,
): NoteReviewState {
  const existingMap = new Map(state.items.map((item) => [item.noteId, item]));
  const nowIso = new Date().toISOString();

  const nextItems = [...state.items];

  for (const note of notes) {
    const existing = existingMap.get(note.id);
    if (existing) {
      const index = nextItems.findIndex((item) => item.id === existing.id);
      if (index !== -1) {
        nextItems[index] = {
          ...existing,
          scheduledDate: today,
          status: existing.status === "mastered" ? "reviewed" : "pending",
          noteTitle: note.title,
          noteRelativePath: note.relativePath,
        };
      }
    } else {
      nextItems.push({
        id: `nr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        noteId: note.id,
        noteTitle: note.title,
        noteRelativePath: note.relativePath,
        scheduledDate: today,
        addedAt: nowIso,
        lastReviewedAt: null,
        reviewCount: 0,
        status: "pending",
      });
    }
  }

  return { ...state, items: nextItems };
}

export function updateNoteReviewStatus(
  state: NoteReviewState,
  itemId: string,
  status: NoteReviewStatus,
  today: string,
): NoteReviewState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        status,
        lastReviewedAt: today,
        reviewCount: item.reviewCount + 1,
      };
    }),
  };
}

export function removeNoteFromToday(state: NoteReviewState, itemId: string): NoteReviewState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, scheduledDate: "" };
    }),
  };
}

export function deleteNoteReviewItem(state: NoteReviewState, itemId: string): NoteReviewState {
  return {
    ...state,
    items: state.items.filter((item) => item.id !== itemId),
  };
}

export function markNoteEnrolledInSpaced(
  state: NoteReviewState,
  itemId: string,
  knowledgePointId: string,
): NoteReviewState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        inSpacedRepetition: true,
        knowledgePointId,
      };
    }),
  };
}

export function getTodayNoteReviewQueue(state: NoteReviewState, today: string): NoteReviewItem[] {
  return state.items.filter((item) => {
    if (!item.scheduledDate) return false;
    if (item.scheduledDate === today) return true;
    // Overdue items that haven't been completed yet
    return item.scheduledDate < today && item.status !== "reviewed" && item.status !== "mastered";
  });
}

export function getTodayNoteReviewMetrics(state: NoteReviewState, today: string) {
  const queue = getTodayNoteReviewQueue(state, today);
  const completedToday = queue.filter(
    (item) => item.status === "reviewed" || item.status === "mastered",
  ).length;
  const totalToday = queue.length;
  const pendingToday = Math.max(0, totalToday - completedToday);

  return { totalToday, completedToday, pendingToday };
}
