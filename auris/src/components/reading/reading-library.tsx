"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsDownUp,
  BookOpen,
  Eye,
  UploadSimple,
} from "@phosphor-icons/react";
import {
  READING_SOURCES,
  type ReadingSource,
  type ReadingSourceCategory,
} from "@/features/reading/reading-fixtures";
import { getWordCount } from "@/features/reading/reading-text";
import {
  filterSources,
  parseReadingLibraryFilter,
  readingLibraryHref,
  type ReadingLibraryFilter,
} from "@/features/reading/reading-library";
import {
  loadDeletedReadingSourceIds,
  loadReadingFavorites,
  loadReadingProgress,
  markReadingSourceDeleted,
} from "@/features/reading/reading-library-store";
import {
  loadReadingSourceNotes,
  saveReadingSourceNote,
} from "@/features/reading/reading-source-note";
import {
  READING_IMPORT_ACCEPT,
  createReadingSourceFromFile,
} from "@/features/reading/reading-import";
import { deleteReadingPdfBytes } from "@/features/reading/reading-pdf-store";
import "@/components/reading/reading-library.css";
import type { NotesStorage } from "@/features/notes/note-types";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";

type ReadingImportCategory = Extract<
  ReadingSourceCategory,
  "article" | "book" | "exam"
>;

type ReadingLibraryProps = {
  onImported?: (source: ReadingSource) => void;
  onOpen: (sourceId: string) => void;
  notesStorage?: NotesStorage | null;
  sessionSources?: ReadingSource[];
};

type ReadingSortDirection = "newest" | "oldest";

type ReadingDateGroup = {
  dateKey: string;
  label: string;
  sources: ReadingSource[];
};

function getTotalWords(source: ReadingSource) {
  return source.paragraphs.reduce(
    (total, paragraph) => total + getWordCount(paragraph.english),
    0,
  );
}

function getProgressLabel(progress: number) {
  if (progress >= 100) {
    return "已读 100%";
  }
  if (progress > 0) {
    return `继续阅读 ${progress}%`;
  }
  return "待阅读";
}

function isNestedButtonEvent(event: React.KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest("button, select, input, a"));
}

function getSourceDateKey(source: ReadingSource) {
  const date = source.importedAt ?? source.publishedAt;
  return date?.slice(0, 10) || "undated";
}

function formatSourceDate(dateKey: string) {
  return dateKey === "undated" ? "未标日期" : dateKey.replaceAll("-", ".");
}

function getEnglishPreview(source: ReadingSource, limit = 3) {
  const paragraphs = source.paragraphs
    .map((paragraph) => paragraph.english.trim())
    .filter(Boolean)
    .slice(0, limit);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return [source.summary?.trim() || "Open this reading to begin your next page."];
}

function getChinesePreview(source: ReadingSource, limit = 3) {
  const paragraphs = source.paragraphs
    .map((paragraph) => paragraph.translation.trim())
    .filter((translation) => translation && translation !== "placeholder")
    .slice(0, limit);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return [source.summary?.trim() || "这份材料暂时没有中文导读，进入阅读页后可继续精读。"];
}

function makeScrollablePreview(paragraphs: string[]) {
  const repeatCount = Math.max(1, Math.ceil(6 / paragraphs.length));
  return Array.from({ length: repeatCount }, () => paragraphs).flat();
}

function getShelfHeading(filter: ReadingLibraryFilter) {
  switch (filter) {
    case "book":
      return "Books";
    case "exam":
      return "Exams";
    default:
      return "Reading Library";
  }
}

function groupSourcesByDate(
  sources: ReadingSource[],
  direction: ReadingSortDirection,
): ReadingDateGroup[] {
  const sorted = [...sources].sort((left, right) => {
    const comparison = getSourceDateKey(left).localeCompare(getSourceDateKey(right));
    return direction === "newest" ? -comparison : comparison;
  });
  const groups = new Map<string, ReadingSource[]>();

  for (const source of sorted) {
    const dateKey = getSourceDateKey(source);
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), source]);
  }

  return Array.from(groups, ([dateKey, groupedSources]) => ({
    dateKey,
    label: formatSourceDate(dateKey),
    sources: groupedSources,
  }));
}

export function ReadingLibrary({
  onImported,
  onOpen,
  notesStorage,
  sessionSources = [],
}: ReadingLibraryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storage = useMemo(
    () => (notesStorage === undefined ? getNotesStorage() : notesStorage),
    [notesStorage],
  );
  const [userSources, setUserSources] = useState<ReadingSource[]>([]);
  const filter = parseReadingLibraryFilter(searchParams.get("filter"));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(() => new Set());
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [importCategory, setImportCategory] =
    useState<ReadingImportCategory>(() =>
      filter === "article" || filter === "book" || filter === "exam"
        ? filter
        : "article",
    );
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [movingSourceId, setMovingSourceId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] =
    useState<ReadingSortDirection>("newest");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDeletedSourceIds(loadDeletedReadingSourceIds());
    setFavorites(loadReadingFavorites());
    setProgressMap(loadReadingProgress());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const reloadSources = () => {
      void loadReadingSourceNotes(storage).then((persistedSources) => {
        if (!cancelled) {
          setUserSources(persistedSources);
        }
      });
    };

    reloadSources();
    const unsubscribe = storage?.subscribeToChanges?.(reloadSources);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [storage]);

  const allSources = useMemo(() => {
    const seen = new Set<string>();
    const merged: ReadingSource[] = [];

    for (const source of [...userSources, ...sessionSources, ...READING_SOURCES]) {
      if (deletedSourceIds.has(source.id)) {
        continue;
      }
      if (seen.has(source.id)) {
        continue;
      }
      seen.add(source.id);
      merged.push(source);
    }

    return merged;
  }, [deletedSourceIds, userSources, sessionSources]);

  const visibleSources = useMemo(
    () => filterSources(allSources, filter, favorites, progressMap),
    [allSources, filter, favorites, progressMap],
  );
  const editableSourceIds = useMemo(
    () => new Set(userSources.map((source) => source.id)),
    [userSources],
  );

  const searchedSources = visibleSources;
  const featuredSource = useMemo(
    () =>
      searchedSources.find((source) => {
        const progress = progressMap[source.id] ?? source.progress ?? 0;
        return progress > 0 && progress < 100;
      }) ?? searchedSources[0] ?? null,
    [progressMap, searchedSources],
  );
  const listedSources = useMemo(
    () => searchedSources.filter((source) => source.id !== featuredSource?.id),
    [featuredSource?.id, searchedSources],
  );
  const dateGroups = useMemo(
    () => groupSourcesByDate(listedSources, sortDirection),
    [listedSources, sortDirection],
  );

  function resolveProgress(source: ReadingSource) {
    return progressMap[source.id] ?? source.progress ?? 0;
  }

  function handleDeleteSource(sourceId: string) {
    setDeletedSourceIds(new Set(markReadingSourceDeleted(sourceId)));
    setUserSources((currentSources) =>
      currentSources.filter((source) => source.id !== sourceId),
    );

    const isLocalSource =
      userSources.some((source) => source.id === sourceId) ||
      sessionSources.some((source) => source.id === sourceId);
    if (isLocalSource) {
      void storage?.deletePage(sourceId).catch(() => undefined);
      void deleteReadingPdfBytes(sourceId).catch(() => undefined);
    }
  }

  function openFilePicker() {
    setImportMessage(null);
    fileInputRef.current?.click();
  }

  function openQuickImport() {
    openFilePicker();
  }

  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportMessage(null);

    try {
      const nextSource = await createReadingSourceFromFile(file, {
        category: importCategory,
      });

      setUserSources((currentSources) => [
        nextSource,
        ...currentSources.filter((source) => source.id !== nextSource.id),
      ]);
      void saveReadingSourceNote(storage, nextSource);
      onImported?.(nextSource);
      router.replace(readingLibraryHref(importCategory), { scroll: false });
      onOpen(nextSource.id);
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "导入失败，请稍后再试。",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSourceCategoryChange(
    source: ReadingSource,
    category: ReadingImportCategory,
  ) {
    if (source.category === category) {
      return;
    }
    if (category === "exam" && (source.examSections?.length ?? 0) === 0) {
      setImportMessage(
        "未识别到题型结构，请先在 Markdown 中添加“## 题型: 阅读理解”。",
      );
      return;
    }

    const nextSource = { ...source, category };
    setMovingSourceId(source.id);
    setImportMessage(null);

    try {
      const saved = await saveReadingSourceNote(storage, nextSource);
      if (storage && !saved) {
        throw new Error("无法移动这份阅读材料。");
      }
      setUserSources((currentSources) =>
        currentSources.map((item) =>
          item.id === source.id ? nextSource : item,
        ),
      );
      router.replace(readingLibraryHref(category), { scroll: false });
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "分类更新失败，请稍后再试。",
      );
    } finally {
      setMovingSourceId(null);
    }
  }

  if (filter !== "article") {
    return (
      <main className="reading-library reading-library--cover-shelf">
        <div className="reading-library__legacy-canvas">
          <header className="reading-library__legacy-topbar">
            <div>
              <p className="reading-library__legacy-kicker">Your reading room</p>
              <h1>{getShelfHeading(filter)}</h1>
              <p className="reading-library__legacy-count">
                {searchedSources.length} 份阅读材料
              </p>
            </div>
            <div className="reading-library__top-actions">
              <label className="reading-library__import-category">
                <span>导入到</span>
                <select
                  aria-label="选择导入分类"
                  disabled={isImporting}
                  onChange={(event) =>
                    setImportCategory(event.target.value as ReadingImportCategory)
                  }
                  value={importCategory}
                >
                  <option value="article">文章</option>
                  <option value="book">书籍</option>
                  <option value="exam">题目</option>
                </select>
              </label>
              <button
                className="reading-library__quick-import"
                disabled={isImporting}
                onClick={openQuickImport}
                type="button"
              >
                <UploadSimple weight="bold" />
                {isImporting ? "Importing…" : "Import"}
              </button>
            </div>
          </header>

          {searchedSources.length === 0 ? (
            <div className="reading-library__empty">
              <BookOpen />
              <strong>还没有这类阅读材料</strong>
              <span>可以从右上角导入 Markdown、Word 或 PDF。</span>
            </div>
          ) : (
            <section aria-label="Reading shelf" className="reading-library__legacy-shelf">
              {searchedSources.map((source, index) => {
                const progress = resolveProgress(source);
                return (
                  <article
                    className="reading-library__legacy-card"
                    data-cover={String(index % 6)}
                    key={source.id}
                    onClick={() => onOpen(source.id)}
                    onKeyDown={(event) => {
                      if (isNestedButtonEvent(event)) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(source.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="reading-library__legacy-cover">
                      <div aria-hidden="true" className="reading-library__legacy-cover-art">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="reading-library__legacy-cover-icon">
                        <BookOpen />
                      </div>
                      <div className="reading-library__legacy-cover-copy">
                        <span>{source.category === "exam" ? "Study edition" : source.kicker}</span>
                        <h2>{source.title}</h2>
                        <p>{source.author || "Imported by you"}</p>
                      </div>
                      <div className="reading-library__legacy-cover-progress">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="reading-library__legacy-card-info">
                      <div>
                        <strong>{source.title}</strong>
                        <p>{source.author || "Imported by you"}</p>
                      </div>
                      <div className="reading-library__legacy-actions">
                        {editableSourceIds.has(source.id) &&
                        (source.category === "article" ||
                          source.category === "book" ||
                          source.category === "exam") ? (
                          <select
                            aria-label={`修改 ${source.title} 的分类`}
                            className="reading-library__legacy-category"
                            disabled={movingSourceId === source.id}
                            onChange={(event) => {
                              event.stopPropagation();
                              void handleSourceCategoryChange(
                                source,
                                event.target.value as ReadingImportCategory,
                              );
                            }}
                            onClick={(event) => event.stopPropagation()}
                            value={source.category}
                          >
                            <option value="article">文章</option>
                            <option value="book">书籍</option>
                            <option value="exam">题目</option>
                          </select>
                        ) : null}
                        <button
                          aria-label={`删除 ${source.title}`}
                          className="reading-library__legacy-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteSource(source.id);
                          }}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <div className="reading-library__legacy-meta">
                      <span>{getProgressLabel(progress)}</span>
                      <span>·</span>
                      <span>{source.estimatedMinutes} min</span>
                      <span>·</span>
                      <span>
                        {source.format === "pdf"
                          ? `${source.pageCount ?? "?"} pages`
                          : `${getTotalWords(source)} words`}
                      </span>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          <input
            accept={READING_IMPORT_ACCEPT}
            className="reading-library__file-input"
            onChange={(event) => void handleImportFileChange(event)}
            ref={fileInputRef}
            type="file"
          />
          {importMessage ? <p className="reading-library__import-message">{importMessage}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="reading-library">
      <div className="reading-library__canvas">
        <header className="reading-library__topbar">
          <div className="reading-library__heading-copy">
            <h1 tabIndex={0}>
              <span className="reading-library__title-language reading-library__title-language--english">
                Reading
              </span>
              <span
                aria-hidden="true"
                className="reading-library__title-language reading-library__title-language--chinese"
              >
                阅读
              </span>
            </h1>
            <span className="reading-library__visually-hidden">
              {searchedSources.length} 份阅读材料
            </span>
          </div>
          <div className="reading-library__top-actions">
            <button
              aria-label={
                sortDirection === "newest" ? "切换为最早优先" : "切换为最新优先"
              }
              className="reading-library__sort"
              onClick={() =>
                setSortDirection((current) =>
                  current === "newest" ? "oldest" : "newest",
                )
              }
              type="button"
            >
              <ArrowsDownUp aria-hidden="true" />
              <span>{sortDirection === "newest" ? "最新优先" : "最早优先"}</span>
            </button>
            <label className="reading-library__import-category">
              <span>导入到</span>
              <select
                aria-label="选择导入分类"
                disabled={isImporting}
                onChange={(event) =>
                  setImportCategory(event.target.value as ReadingImportCategory)
                }
                value={importCategory}
              >
                <option value="article">文章</option>
                <option value="book">书籍</option>
                <option value="exam">题目</option>
              </select>
            </label>
            <button
              className="reading-library__quick-import"
              disabled={isImporting}
              onClick={openQuickImport}
              type="button"
            >
              <UploadSimple weight="bold" />
              {isImporting ? "Importing…" : "Import"}
            </button>
          </div>
        </header>

        {featuredSource ? (
          <section aria-label="正在阅读" className="reading-library__featured">
            <article
              className="reading-library__featured-card"
              onClick={() => onOpen(featuredSource.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(featuredSource.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <header className="reading-library__featured-header">
                <div>
                  <span className="reading-library__featured-label">正在阅读</span>
                  <h2>{featuredSource.title}</h2>
                  <time
                    className="reading-library__visually-hidden"
                    dateTime={
                      getSourceDateKey(featuredSource) === "undated"
                        ? undefined
                        : getSourceDateKey(featuredSource)
                    }
                  >
                    {formatSourceDate(getSourceDateKey(featuredSource))}
                  </time>
                </div>
                <span className="reading-library__featured-progress">
                  {getProgressLabel(resolveProgress(featuredSource))}
                </span>
              </header>
              <div className="reading-library__featured-window">
                <div className="reading-library__language-panel reading-library__language-panel--english">
                  <div className="reading-library__preview-scroll">
                    {makeScrollablePreview(getEnglishPreview(featuredSource, 6)).map(
                      (paragraph, index) => (
                        <p key={`${featuredSource.id}-featured-en-${index}`}>{paragraph}</p>
                      ),
                    )}
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="reading-library__language-panel reading-library__language-panel--chinese"
                >
                  <div className="reading-library__preview-scroll">
                    {makeScrollablePreview(getChinesePreview(featuredSource, 6)).map(
                      (paragraph, index) => (
                        <p key={`${featuredSource.id}-featured-zh-${index}`}>{paragraph}</p>
                      ),
                    )}
                  </div>
                </div>
                <span aria-hidden="true" className="reading-library__language-cue">
                  EN <i /> 中
                </span>
              </div>
            </article>
          </section>
        ) : null}

      {searchedSources.length === 0 ? (
        <div className="reading-library__empty">
          <BookOpen />
          <strong>No books found</strong>
          <span>Try a different search, or import a Markdown/PDF book.</span>
        </div>
      ) : null}

        <section aria-label="Ebook shelf" className="reading-library__shelf">
          {dateGroups.map((group) => (
            <section className="reading-library__date-group" key={group.dateKey}>
              <header className="reading-library__date-heading">
                <time dateTime={group.dateKey === "undated" ? undefined : group.dateKey}>
                  {group.label}
                </time>
                <span aria-hidden="true" />
              </header>
              <div className="reading-library__date-entries">
                {group.sources.map((source) => {
                  const progress = resolveProgress(source);
                  return (
                    <article
                      className="reading-library__entry"
                      key={source.id}
                      onClick={() => onOpen(source.id)}
                      onKeyDown={(event) => {
                        if (isNestedButtonEvent(event)) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(source.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="reading-library__entry-stage">
                        <h2>{source.title}</h2>
                        <p className="reading-library__entry-author">
                          {source.author || "Imported by you"}
                        </p>
                        <div className="reading-library__entry-preview">
                          <p className="reading-library__entry-excerpt">
                            {getEnglishPreview(source, 2).join(" ")}
                          </p>
                          <p
                            aria-hidden="true"
                            className="reading-library__entry-excerpt reading-library__entry-excerpt--chinese"
                          >
                            {getChinesePreview(source, 2).join("")}
                          </p>
                        </div>
                      </div>

                      <aside className="reading-library__entry-aside">
                        <span
                          className="reading-library__status"
                          data-done={progress >= 100 ? "true" : "false"}
                        >
                          {getProgressLabel(progress)}
                        </span>
                        <div className="reading-library__meta">
                          <span>{source.estimatedMinutes} min</span>
                          <span>·</span>
                          <span>
                            {source.format === "pdf"
                              ? `${source.pageCount ?? "?"} pages`
                              : `${getTotalWords(source)} words`}
                          </span>
                        </div>
                        <span className="reading-library__open-cue">
                          开始阅读 <Eye aria-hidden="true" weight="fill" />
                        </span>
                      </aside>

                      <div className="reading-library__entry-actions">
                        {editableSourceIds.has(source.id) &&
                        (source.category === "article" ||
                          source.category === "book" ||
                          source.category === "exam") ? (
                          <select
                            aria-label={`修改 ${source.title} 的分类`}
                            className="reading-library__card-category"
                            disabled={movingSourceId === source.id}
                            onChange={(event) => {
                              event.stopPropagation();
                              void handleSourceCategoryChange(
                                source,
                                event.target.value as ReadingImportCategory,
                              );
                            }}
                            onClick={(event) => event.stopPropagation()}
                            value={source.category}
                          >
                            <option value="article">文章</option>
                            <option value="book">书籍</option>
                            <option value="exam">题目</option>
                          </select>
                        ) : null}
                        <button
                          aria-label={`删除 ${source.title}`}
                          className="reading-library__delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteSource(source.id);
                          }}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>

        <input
          accept={READING_IMPORT_ACCEPT}
          className="reading-library__file-input"
          onChange={(event) => void handleImportFileChange(event)}
          ref={fileInputRef}
          type="file"
        />
        {importMessage ? <p className="reading-library__import-message">{importMessage}</p> : null}
      </div>
    </main>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="reading-library__icon" viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l.7 12a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4L17 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
