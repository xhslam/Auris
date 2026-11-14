"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  BookTextIcon,
  CheckIcon,
  ChevronDownIcon,
  RotateCcwIcon,
  SunIcon,
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
  type ParagraphReviewStatus,
  type ReadingBookReviewState,
} from "@/features/reading/reading-book-review-store";
import "./reading-book-review.css";

type FilterMode = "all" | "unknown" | "unreviewed";

export type ReadingBookReviewProps = {
  initialBookId?: string | null;
  onNotice?: (text: string) => void;
  onGoToToday?: () => void;
};

export function ReadingBookReview({
  initialBookId = null,
  onNotice,
  onGoToToday,
}: ReadingBookReviewProps) {
  const router = useRouter();
  const [sources, setSources] = useState<ReadingSource[]>(() => READING_SOURCES);
  const [reviewState, setReviewState] = useState<ReadingBookReviewState>(() =>
    loadReadingBookReviewState(typeof window !== "undefined" ? window.localStorage : null),
  );
  const [selectedBookId, setSelectedBookId] = useState<string | null>(initialBookId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showOutline, setShowOutline] = useState(false);

  // 加载本地笔记 Vault 与预设书籍
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

  // 监听持久化存储变化
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

  // 优先筛选出所有书籍（category 为 book，或标题/类别含书籍）
  const books = useMemo(() => {
    const exactBooks = sources.filter(
      (source) => source.category === "book" || source.kicker.includes("书籍"),
    );
    if (exactBooks.length > 0) return exactBooks;
    return sources.filter((source) => source.paragraphs.length > 0);
  }, [sources]);

  // 决定当前选中的书籍
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

  // 当选择书籍时，初始化或恢复上次学习进度
  const handleSelectBook = useCallback(
    (bookId: string) => {
      setSelectedBookId(bookId);
      setIsRevealed(false);
      if (typeof window !== "undefined") {
        setActiveReviewBookId(window.localStorage, bookId);
      }
      const record = getBookReviewRecord(reviewState, bookId);
      setCurrentIndex(record.lastReviewedIndex || 0);
    },
    [reviewState],
  );

  const currentRecord = useMemo(() => {
    if (!currentBook) return undefined;
    return getBookReviewRecord(reviewState, currentBook.id, currentBook.title);
  }, [currentBook, reviewState]);

  const metrics = useMemo(() => {
    return getBookReviewMetrics(currentRecord, currentBook?.paragraphs.length ?? 0);
  }, [currentBook, currentRecord]);

  // 根据 filterMode 筛选段落
  const filteredParagraphs = useMemo(() => {
    if (!currentBook) return [];
    if (filterMode === "all") return currentBook.paragraphs;
    const statuses = currentRecord?.paragraphStatuses ?? {};
    if (filterMode === "unknown") {
      return currentBook.paragraphs.filter((p) => statuses[p.id] === "unknown");
    }
    if (filterMode === "unreviewed") {
      return currentBook.paragraphs.filter((p) => !statuses[p.id] || statuses[p.id] === "unreviewed");
    }
    return currentBook.paragraphs;
  }, [currentBook, currentRecord, filterMode]);

  // 边界保护：确保当前索引在合法范围
  const safeIndex = Math.max(
    0,
    Math.min(currentIndex, Math.max(0, filteredParagraphs.length - 1)),
  );
  const currentParagraph = filteredParagraphs[safeIndex] as ReadingParagraph | undefined;

  // 键盘快捷键支持：空格展开解析，左右箭头翻页
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        setIsRevealed((prev) => !prev);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (safeIndex < filteredParagraphs.length - 1) {
          setCurrentIndex(safeIndex + 1);
          setIsRevealed(false);
        }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (safeIndex > 0) {
          setCurrentIndex(safeIndex - 1);
          setIsRevealed(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredParagraphs.length, safeIndex]);

  // 记录掌握状态并跳往下一题
  const handleMarkStatus = (status: ParagraphReviewStatus) => {
    if (!currentBook || !currentParagraph) return;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const nextState = recordParagraphReview(
      storage,
      currentBook.id,
      currentBook.title,
      currentParagraph.id,
      status,
      safeIndex,
    );
    setReviewState(nextState);

    if (status === "mastered") {
      onNotice?.("已标记为掌握，并自动进入下一段。");
    } else if (status === "fuzzy") {
      onNotice?.("已标记为稍后巩固，继续保持！");
    }

    // 自动进入下一段
    if (safeIndex < filteredParagraphs.length - 1) {
      setCurrentIndex(safeIndex + 1);
      setIsRevealed(false);
    }
  };

  // 核心功能：不会的可以跳转到笔记中回顾
  const handleJumpToNotes = async () => {
    if (!currentBook || !currentParagraph) return;

    // 1. 记录为不会 (unknown)
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const nextState = recordParagraphReview(
      storage,
      currentBook.id,
      currentBook.title,
      currentParagraph.id,
      "unknown",
      safeIndex,
    );
    setReviewState(nextState);

    // 2. 确保书籍作为笔记已落盘在 Vault 中 (Reading/书籍/xxx.md)
    try {
      const notesStorage = getNotesStorage();
      if (notesStorage) {
        await saveReadingSourceNote(notesStorage, currentBook);
      }
    } catch {
      // 容错：即使保存异常也继续跳转
    }

    onNotice?.(`已记录难点，正在跳转到《${currentBook.title}》笔记查看上下文…`);

    // 3. 路由跳转到 Notes 工作台
    router.push(`/notes?resumeNoteId=${encodeURIComponent(currentBook.id)}`);
  };

  if (!currentBook || books.length === 0) {
    return (
      <div className="reading-book-review">
        <div className="reading-book-review__empty">
          <BookTextIcon size={48} />
          <h3>Reading 区域暂未找到书籍</h3>
          <p>您可以在“阅读精选”中导入书籍（Markdown 或 TXT），或使用系统内置经典书籍进行回顾。</p>
          {onGoToToday ? (
            <button
              className="output-review-secondary"
              onClick={onGoToToday}
              type="button"
            >
              返回今日复盘
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const currentParagraphStatus =
    currentParagraph && currentRecord?.paragraphStatuses[currentParagraph.id]
      ? currentRecord.paragraphStatuses[currentParagraph.id]
      : "unreviewed";

  return (
    <section aria-label="Reading 书籍回顾" className="reading-book-review">
      {/* 顶部工具栏与书籍切换 */}
      <div className="reading-book-review__topbar">
        <div className="reading-book-review__title-group">
          <h2>
            <BookOpenIcon size={20} />
            <span>Reading 书籍回顾</span>
          </h2>
          <p>从阅读精选挑选书籍 · 先回忆译文与句意，遇到生疏点一键跳转笔记深挖</p>
        </div>

        <div className="reading-book-review__controls">
          <label className="sr-only" htmlFor="reading-book-selector">
            选择书籍
          </label>
          <select
            className="reading-book-review__book-select"
            id="reading-book-selector"
            onChange={(event) => handleSelectBook(event.target.value)}
            value={currentBook.id}
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title} ({book.paragraphs.length} 段)
              </option>
            ))}
          </select>

          <button
            className="reading-book-review__quick-link"
            onClick={() => router.push(`/reading?sourceId=${encodeURIComponent(currentBook.id)}`)}
            title="在双语阅读器中浏览全书"
            type="button"
          >
            <span>阅读器精读</span>
            <ArrowUpRightIcon size={14} />
          </button>

          <button
            className="reading-book-review__quick-link"
            onClick={() => router.push(`/notes?resumeNoteId=${encodeURIComponent(currentBook.id)}`)}
            title="在本地笔记工作台中打开整篇笔记"
            type="button"
          >
            <span>查看完整笔记</span>
            <ArrowUpRightIcon size={14} />
          </button>

          {onGoToToday ? (
            <button
              className="reading-book-review__quick-link"
              onClick={onGoToToday}
              type="button"
            >
              返回今日
            </button>
          ) : null}
        </div>
      </div>

      {/* 书籍信息与掌握度统计 */}
      <div className="reading-book-review__book-card">
        <div className="reading-book-review__book-meta">
          <div className="reading-book-review__book-text">
            <span className="reading-book-review__book-kicker">{currentBook.kicker}</span>
            <h3 className="reading-book-review__book-title">{currentBook.title}</h3>
            {currentBook.summary ? (
              <p className="reading-book-review__book-desc">{currentBook.summary}</p>
            ) : null}
          </div>
          <div className="reading-book-review__stats-pills">
            <span className="reading-book-review__stat-pill" data-variant="mastered">
              <CheckIcon size={14} /> 已掌握 {metrics.mastered} 段
            </span>
            <span className="reading-book-review__stat-pill" data-variant="unknown">
              不会 / 难点 {metrics.unknown} 段
            </span>
            <span className="reading-book-review__stat-pill" data-variant="fuzzy">
              模糊 {metrics.fuzzy} 段
            </span>
            <span className="reading-book-review__stat-pill">
              共 {metrics.total} 段
            </span>
          </div>
        </div>

        <div
          aria-label={`复习掌握进度 ${metrics.progressPercent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={metrics.progressPercent}
          className="reading-book-review__progress-track"
          role="progressbar"
        >
          <div
            className="reading-book-review__progress-bar"
            style={{ width: `${metrics.progressPercent}%` }}
          />
        </div>
      </div>

      {/* 筛选模式与目录切换 */}
      <div className="reading-book-review__filter-bar">
        <div className="reading-book-review__filter-tabs" role="tablist">
          <button
            className="reading-book-review__filter-btn"
            data-active={filterMode === "all"}
            onClick={() => {
              setFilterMode("all");
              setCurrentIndex(0);
              setIsRevealed(false);
            }}
            type="button"
          >
            全部段落 ({currentBook.paragraphs.length})
          </button>
          <button
            className="reading-book-review__filter-btn"
            data-active={filterMode === "unknown"}
            onClick={() => {
              setFilterMode("unknown");
              setCurrentIndex(0);
              setIsRevealed(false);
            }}
            type="button"
          >
            不会 / 待攻克 ({metrics.unknown})
          </button>
          <button
            className="reading-book-review__filter-btn"
            data-active={filterMode === "unreviewed"}
            onClick={() => {
              setFilterMode("unreviewed");
              setCurrentIndex(0);
              setIsRevealed(false);
            }}
            type="button"
          >
            未复习 ({metrics.unreviewed})
          </button>
        </div>

        <button
          className="reading-book-review__outline-toggle"
          onClick={() => setShowOutline((prev) => !prev)}
          type="button"
        >
          <span>{showOutline ? "收起段落索引" : "展开段落索引"}</span>
          <ChevronDownIcon
            size={14}
            style={{ transform: showOutline ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          />
        </button>
      </div>

      {/* 段落索引目录（可展开） */}
      {showOutline ? (
        <div className="reading-book-review__outline-drawer">
          <div className="reading-book-review__outline-header">
            <span>点击任意段落直接跳转</span>
            <span>{currentBook.paragraphs.length} 个段落</span>
          </div>
          <div className="reading-book-review__outline-list">
            {currentBook.paragraphs.map((para, idx) => {
              const status = currentRecord?.paragraphStatuses[para.id] ?? "unreviewed";
              return (
                <button
                  className="reading-book-review__outline-item"
                  data-current={currentParagraph?.id === para.id}
                  key={para.id}
                  onClick={() => {
                    const matchIdx = filteredParagraphs.findIndex((p) => p.id === para.id);
                    if (matchIdx !== -1) {
                      setCurrentIndex(matchIdx);
                    } else {
                      setFilterMode("all");
                      setCurrentIndex(idx);
                    }
                    setIsRevealed(false);
                  }}
                  type="button"
                >
                  <span className="reading-book-review__outline-item-index">#{idx + 1}</span>
                  <span className="reading-book-review__outline-item-text">{para.english}</span>
                  <span className="reading-book-review__status-tag" data-status={status}>
                    {status === "mastered"
                      ? "掌握"
                      : status === "unknown"
                        ? "不会"
                        : status === "fuzzy"
                          ? "模糊"
                          : "未练"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 核心回顾舞台卡片 */}
      {currentParagraph ? (
        <article className="reading-book-review__card">
          <div className="reading-book-review__card-header">
            <span className="reading-book-review__paragraph-badge">
              段落 {safeIndex + 1} / {filteredParagraphs.length}
            </span>
            <span
              className="reading-book-review__status-tag"
              data-status={currentParagraphStatus}
            >
              {currentParagraphStatus === "mastered"
                ? "✓ 已掌握"
                : currentParagraphStatus === "unknown"
                  ? "⚠ 不会 / 待攻克"
                  : currentParagraphStatus === "fuzzy"
                    ? "◔ 需巩固"
                    : "○ 待回忆"}
            </span>
          </div>

          {/* 英文主段落 */}
          <p className="reading-book-review__english">{currentParagraph.english}</p>

          {/* 关键词标签 */}
          {currentParagraph.wordKeys && currentParagraph.wordKeys.length > 0 ? (
            <div className="reading-book-review__word-keys">
              {currentParagraph.wordKeys.map((key) => (
                <span className="reading-book-review__word-tag" key={key}>
                  #{key}
                </span>
              ))}
            </div>
          ) : null}

          {/* 揭晓译文与解析区 */}
          <div className="reading-book-review__reveal-block">
            {!isRevealed ? (
              <button
                className="reading-book-review__reveal-trigger"
                onClick={() => setIsRevealed(true)}
                type="button"
              >
                <SunIcon size={18} />
                <span>先在大脑中回忆意思 · 点击或按空格键揭晓译文与解析</span>
              </button>
            ) : (
              <div className="reading-book-review__revealed-content">
                <p className="reading-book-review__translation">
                  {currentParagraph.translation}
                </p>
                {currentParagraph.analysis ? (
                  <p className="reading-book-review__analysis">
                    <strong>精读解析：</strong>
                    {currentParagraph.analysis}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* 操作行 */}
          <div className="reading-book-review__actions-row">
            <div className="reading-book-review__review-buttons">
              {/* 核心需求：不会的可以跳转到笔记中回顾 */}
              <button
                className="reading-book-review__btn-jump-notes"
                onClick={handleJumpToNotes}
                title="标记为不会，并立即打开本地笔记工作台查看完整笔记与上下文"
                type="button"
              >
                <BookOpenIcon size={16} />
                <span>不会，跳转到笔记中回顾</span>
                <ArrowRightIcon size={14} />
              </button>

              <button
                className="reading-book-review__btn-master"
                onClick={() => handleMarkStatus("mastered")}
                type="button"
              >
                <CheckIcon size={16} />
                <span>记住了 / 掌握</span>
              </button>

              <button
                className="reading-book-review__btn-fuzzy"
                onClick={() => handleMarkStatus("fuzzy")}
                type="button"
              >
                <RotateCcwIcon size={15} />
                <span>模糊 / 稍后复习</span>
              </button>
            </div>

            <div className="reading-book-review__nav-buttons">
              <button
                aria-label="上一段"
                className="reading-book-review__nav-btn"
                disabled={safeIndex === 0}
                onClick={() => {
                  setCurrentIndex(safeIndex - 1);
                  setIsRevealed(false);
                }}
                type="button"
              >
                ← 上一段
              </button>
              <button
                aria-label="下一段"
                className="reading-book-review__nav-btn"
                disabled={safeIndex >= filteredParagraphs.length - 1}
                onClick={() => {
                  setCurrentIndex(safeIndex + 1);
                  setIsRevealed(false);
                }}
                type="button"
              >
                下一段 →
              </button>
            </div>
          </div>
        </article>
      ) : (
        <div className="reading-book-review__empty">
          <CheckIcon size={36} />
          <h3>当前筛选条件下没有待回顾段落</h3>
          <p>
            {filterMode === "unknown"
              ? "太棒了！当前书籍没有标记为“不会”的难点段落。"
              : "当前分类下的段落已全部过完。"}
          </p>
          <button
            className="output-review-secondary"
            onClick={() => setFilterMode("all")}
            type="button"
          >
            查看全部段落
          </button>
        </div>
      )}
    </section>
  );
}
