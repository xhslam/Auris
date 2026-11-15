"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CheckIcon,
} from "@/components/auris-ui/auris-icons";
import {
  READING_SOURCES,
  type ReadingParagraph,
  type ReadingSource,
} from "@/features/reading/reading-fixtures";
import {
  loadReadingSourceNotes,
  saveReadingSourceNote,
} from "@/features/reading/reading-source-note";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import {
  READING_BOOK_REVIEW_EVENT,
  getBookReviewMetrics,
  getBookReviewRecord,
  loadReadingBookReviewState,
  recordParagraphReview,
  setActiveReviewBookId,
  type ReadingBookReviewState,
} from "@/features/reading/reading-book-review-store";

export type TodayBookReviewCardProps = {
  onGoToReadingReview: () => void;
  onNotice?: (text: string) => void;
};

export function TodayBookReviewCard({
  onGoToReadingReview,
  onNotice,
}: TodayBookReviewCardProps) {
  const router = useRouter();
  const [sources, setSources] = useState<ReadingSource[]>(() => READING_SOURCES);
  const [reviewState, setReviewState] = useState<ReadingBookReviewState>(() =>
    loadReadingBookReviewState(typeof window !== "undefined" ? window.localStorage : null),
  );
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const storage = getNotesStorage();
    if (!storage) return;

    loadReadingSourceNotes(storage)
      .then((vaultSources) => {
        if (!active || !vaultSources || vaultSources.length === 0) return;
        setSources((current) => {
          const seen = new Set(current.map((item) => item.id));
          const merged = [...current];
          for (const item of vaultSources) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  // 监听 reviewState 变化
  useEffect(() => {
    const handleStorageChange = () => {
      setReviewState(
        loadReadingBookReviewState(typeof window !== "undefined" ? window.localStorage : null),
      );
    };
    window.addEventListener(READING_BOOK_REVIEW_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener(READING_BOOK_REVIEW_EVENT, handleStorageChange);
    };
  }, []);

  // 优先筛选书籍
  const books = useMemo(() => {
    const exactBooks = sources.filter(
      (source) => source.category === "book" || source.kicker.includes("书籍"),
    );
    if (exactBooks.length > 0) return exactBooks;
    return sources.filter((source) => source.paragraphs.length > 0);
  }, [sources]);

  // 当前选中的书籍
  const currentBook = useMemo(() => {
    if (selectedBookId) {
      const match = books.find((b) => b.id === selectedBookId);
      if (match) return match;
    }
    if (reviewState.activeBookId) {
      const match = books.find((b) => b.id === reviewState.activeBookId);
      if (match) return match;
    }
    return books[0] ?? null;
  }, [books, reviewState.activeBookId, selectedBookId]);

  const handleSelectBook = useCallback(
    (bookId: string) => {
      setSelectedBookId(bookId);
      if (typeof window !== "undefined") {
        setActiveReviewBookId(window.localStorage, bookId);
      }
    },
    [],
  );

  const currentRecord = useMemo(() => {
    if (!currentBook) return undefined;
    return getBookReviewRecord(reviewState, currentBook.id, currentBook.title);
  }, [currentBook, reviewState]);

  const metrics = useMemo(() => {
    return getBookReviewMetrics(currentRecord, currentBook?.paragraphs.length ?? 0);
  }, [currentBook, currentRecord]);

  // 挑选下一个待复习或曾记为不会的段落
  const currentParagraph = useMemo(() => {
    if (!currentBook || currentBook.paragraphs.length === 0) return null;
    const statuses = currentRecord?.paragraphStatuses ?? {};

    // 优先攻克标为不会的段落
    const unknownItem = currentBook.paragraphs.find((p) => statuses[p.id] === "unknown");
    if (unknownItem) return unknownItem;

    // 其次挑选尚未复习的段落
    const unreviewedItem = currentBook.paragraphs.find(
      (p) => !statuses[p.id] || statuses[p.id] === "unreviewed",
    );
    if (unreviewedItem) return unreviewedItem;

    // 若全部复习过，返回上次记录或第一段
    const idx = currentRecord?.lastReviewedIndex ?? 0;
    return currentBook.paragraphs[Math.min(idx, currentBook.paragraphs.length - 1)] ?? null;
  }, [currentBook, currentRecord]);

  // 标记掌握
  const handleMaster = (para: ReadingParagraph) => {
    if (!currentBook) return;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const idx = currentBook.paragraphs.findIndex((p) => p.id === para.id);
    const nextState = recordParagraphReview(
      storage,
      currentBook.id,
      currentBook.title,
      para.id,
      "mastered",
      idx !== -1 ? idx : 0,
    );
    setReviewState(nextState);
    onNotice?.("已标记为掌握！");
  };

  // 不会的跳转到笔记
  const handleJumpToNotes = async (para: ReadingParagraph) => {
    if (!currentBook) return;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const idx = currentBook.paragraphs.findIndex((p) => p.id === para.id);
    const nextState = recordParagraphReview(
      storage,
      currentBook.id,
      currentBook.title,
      para.id,
      "unknown",
      idx !== -1 ? idx : 0,
    );
    setReviewState(nextState);

    try {
      const notesStorage = getNotesStorage();
      if (notesStorage) {
        await saveReadingSourceNote(notesStorage, currentBook);
      }
    } catch {
      // Ignore write errors
    }

    onNotice?.(`已记录难点，正在跳转到《${currentBook.title}》笔记…`);
    router.push(`/notes?resumeNoteId=${encodeURIComponent(currentBook.id)}`);
  };

  if (!currentBook) return null;

  return (
    <section aria-label="Reading 书籍每日回顾" className="today-book-review-card">
      <div className="today-book-review-card__header">
        <h3 className="today-book-review-card__title">
          <BookOpenIcon size={18} />
          <span>Reading 书籍回顾</span>
          <span className="today-book-review-card__badge">书籍精读</span>
        </h3>
        <button
          className="today-book-review-card__open-full"
          onClick={onGoToReadingReview}
          type="button"
        >
          <span>进入完整回顾</span>
          <ArrowUpRightIcon size={14} />
        </button>
      </div>

      <div className="today-book-review-card__selector">
        <select
          aria-label="选择要回顾的书籍"
          className="today-book-review-card__select"
          onChange={(e) => handleSelectBook(e.target.value)}
          value={currentBook.id}
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>

        <div className="today-book-review-card__stats">
          <span>掌握 {metrics.mastered} / {metrics.total} 段 ({metrics.progressPercent}%)</span>
          {metrics.unknown > 0 ? (
            <span style={{ color: "#ff8a80" }}>· {metrics.unknown} 段待攻克</span>
          ) : null}
        </div>
      </div>

      {currentParagraph ? (
        <div className="today-book-review-card__preview">
          <p className="today-book-review-card__preview-quote">
            “{currentParagraph.english}”
          </p>

          <div className="today-book-review-card__actions">
            <button
              className="today-book-review-card__btn-jump"
              onClick={() => handleJumpToNotes(currentParagraph)}
              title="不会该段落，标记难点并立即跳转到本地笔记工作台回顾"
              type="button"
            >
              <BookOpenIcon size={15} />
              <span>不会，跳转到笔记中回顾</span>
              <ArrowRightIcon size={13} />
            </button>

            <button
              className="today-book-review-card__btn-master"
              onClick={() => handleMaster(currentParagraph)}
              type="button"
            >
              <CheckIcon size={15} />
              <span>记住了</span>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
