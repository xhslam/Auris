/**
 * Reading 书籍回顾状态管理与持久化 (localStorage)。
 * 记录用户在每日回顾中对特定书籍、段落的掌握情况（掌握、模糊、不会/待攻克），
 * 支持持久化记忆、断点续学及快速跳转回顾。
 */

export type ParagraphReviewStatus = "unreviewed" | "mastered" | "fuzzy" | "unknown";

export type BookReviewRecord = {
  bookId: string;
  bookTitle: string;
  lastReviewedIndex: number;
  lastReviewedAt: string;
  paragraphStatuses: Record<string, ParagraphReviewStatus>;
  unknownParagraphIds: string[];
};

export type ReadingBookReviewState = {
  activeBookId: string | null;
  books: Record<string, BookReviewRecord>;
};

export const READING_BOOK_REVIEW_STORAGE_KEY = "auris-reading-book-review-state";
export const READING_BOOK_REVIEW_EVENT = "auris:reading-book-review-changed";

export const EMPTY_BOOK_REVIEW_STATE: ReadingBookReviewState = {
  activeBookId: null,
  books: {},
};

function safeStorage(custom?: Storage | null): Storage | null {
  if (custom !== undefined) return custom;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READING_BOOK_REVIEW_EVENT));
  }
}

export function loadReadingBookReviewState(storageArg?: Storage | null): ReadingBookReviewState {
  const storage = safeStorage(storageArg);
  if (!storage) return { ...EMPTY_BOOK_REVIEW_STATE };
  try {
    const raw = storage.getItem(READING_BOOK_REVIEW_STORAGE_KEY);
    if (!raw) return { ...EMPTY_BOOK_REVIEW_STATE };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const state = parsed as Partial<ReadingBookReviewState>;
      return {
        activeBookId: typeof state.activeBookId === "string" ? state.activeBookId : null,
        books: state.books && typeof state.books === "object" ? state.books : {},
      };
    }
  } catch {
    // Ignore corrupted state
  }
  return { ...EMPTY_BOOK_REVIEW_STATE };
}

export function saveReadingBookReviewState(
  storageArg: Storage | null,
  state: ReadingBookReviewState,
): void {
  const storage = safeStorage(storageArg);
  if (!storage) return;
  try {
    storage.setItem(READING_BOOK_REVIEW_STORAGE_KEY, JSON.stringify(state));
    dispatchChange();
  } catch {
    // Ignore write errors
  }
}

export function getBookReviewRecord(
  state: ReadingBookReviewState,
  bookId: string,
  bookTitle: string = "未命名书籍",
): BookReviewRecord {
  const existing = state.books[bookId];
  if (existing) return existing;
  return {
    bookId,
    bookTitle,
    lastReviewedIndex: 0,
    lastReviewedAt: new Date().toISOString(),
    paragraphStatuses: {},
    unknownParagraphIds: [],
  };
}

export function recordParagraphReview(
  storageArg: Storage | null,
  bookId: string,
  bookTitle: string,
  paragraphId: string,
  status: ParagraphReviewStatus,
  index?: number,
): ReadingBookReviewState {
  const current = loadReadingBookReviewState(storageArg);
  const record = getBookReviewRecord(current, bookId, bookTitle);

  const nextParagraphStatuses = {
    ...record.paragraphStatuses,
    [paragraphId]: status,
  };

  const unknownSet = new Set(record.unknownParagraphIds);
  if (status === "unknown") {
    unknownSet.add(paragraphId);
  } else if (status === "mastered") {
    unknownSet.delete(paragraphId);
  }

  const updatedRecord: BookReviewRecord = {
    ...record,
    bookTitle: bookTitle || record.bookTitle,
    lastReviewedIndex: typeof index === "number" ? index : record.lastReviewedIndex,
    lastReviewedAt: new Date().toISOString(),
    paragraphStatuses: nextParagraphStatuses,
    unknownParagraphIds: Array.from(unknownSet),
  };

  const nextState: ReadingBookReviewState = {
    ...current,
    activeBookId: bookId,
    books: {
      ...current.books,
      [bookId]: updatedRecord,
    },
  };

  saveReadingBookReviewState(storageArg, nextState);
  return nextState;
}

export function setActiveReviewBookId(
  storageArg: Storage | null,
  bookId: string,
): ReadingBookReviewState {
  const current = loadReadingBookReviewState(storageArg);
  const nextState: ReadingBookReviewState = {
    ...current,
    activeBookId: bookId,
  };
  saveReadingBookReviewState(storageArg, nextState);
  return nextState;
}

export function getBookReviewMetrics(
  record: BookReviewRecord | undefined,
  totalParagraphs: number,
) {
  if (!record || totalParagraphs <= 0) {
    return {
      total: totalParagraphs,
      mastered: 0,
      fuzzy: 0,
      unknown: 0,
      unreviewed: totalParagraphs,
      progressPercent: 0,
    };
  }

  let mastered = 0;
  let fuzzy = 0;
  let unknown = 0;

  for (const status of Object.values(record.paragraphStatuses)) {
    if (status === "mastered") mastered += 1;
    else if (status === "fuzzy") fuzzy += 1;
    else if (status === "unknown") unknown += 1;
  }

  const reviewedCount = mastered + fuzzy + unknown;
  const unreviewed = Math.max(0, totalParagraphs - reviewedCount);
  const progressPercent = totalParagraphs > 0 ? Math.round((mastered / totalParagraphs) * 100) : 0;

  return {
    total: totalParagraphs,
    mastered,
    fuzzy,
    unknown,
    unreviewed,
    progressPercent,
  };
}
