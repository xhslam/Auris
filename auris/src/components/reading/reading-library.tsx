"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  READING_SOURCES,
  type ReadingSource,
  type ReadingSourceCategory,
} from "@/features/reading/reading-fixtures";
import { getWordCount } from "@/features/reading/reading-text";
import {
  READING_CURATED_CHILD_FILTERS,
  READING_SIDEBAR_FILTER_LABELS,
  filterSources,
  groupSourcesByDate,
  isReadingLibraryImportMode,
  parseReadingLibraryFilter,
  readingLibraryHref,
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

const IMPORT_CATEGORY_ORDER: ReadingImportCategory[] = ["article", "book", "exam"];

const IMPORT_CATEGORY_HINTS: Record<ReadingImportCategory, string> = {
  article: "导入后会出现在「文章」列表",
  book: "导入后会出现在「书籍」列表",
  exam: "导入后会出现在「题目」列表",
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
  return Boolean(target?.closest("button"));
}

function pickContinueReading(
  sources: ReadingSource[],
  progressById: Readonly<Record<string, number>>,
): ReadingSource | null {
  let best: ReadingSource | null = null;
  let bestProgress = 0;

  for (const source of sources) {
    const progress = progressById[source.id] ?? source.progress ?? 0;
    if (progress <= 0 || progress >= 100) {
      continue;
    }
    if (progress > bestProgress) {
      best = source;
      bestProgress = progress;
    }
  }

  return best;
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
  const isImportMode = isReadingLibraryImportMode(searchParams.get("import"));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(() => new Set());
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [importCategory, setImportCategory] =
    useState<ReadingImportCategory>("article");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDeletedSourceIds(loadDeletedReadingSourceIds());
    setFavorites(loadReadingFavorites());
    setProgressMap(loadReadingProgress());
  }, []);

  useEffect(() => {
    if (!isImportMode) {
      return;
    }
    setImportCategory("article");
    setImportMessage(null);
  }, [isImportMode]);

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

  const groups = useMemo(() => groupSourcesByDate(visibleSources), [visibleSources]);
  const continueReading = useMemo(
    () => pickContinueReading(visibleSources, progressMap),
    [progressMap, visibleSources],
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

  if (isImportMode) {
    return (
      <main className="reading-library reading-library--import">
        <header className="reading-library__topbar">
          <div>
            <p className="reading-library__kicker">Reading Library</p>
            <h1>导入阅读材料</h1>
          </div>
        </header>

        <section
          aria-label="选择导入分类"
          className="reading-library__import-categories"
        >
          <p className="reading-library__import-lead">
            先选择要放入的分类，再选择 Markdown 文件。默认从「文章」开始。
          </p>
          <div className="reading-library__import-boxes">
            {IMPORT_CATEGORY_ORDER.map((category) => (
              <button
                aria-label={`放入${READING_SIDEBAR_FILTER_LABELS[category]}`}
                aria-pressed={importCategory === category}
                className="reading-library__import-box"
                data-active={importCategory === category ? "true" : "false"}
                key={category}
                onClick={() => setImportCategory(category)}
                type="button"
              >
                <strong>{READING_SIDEBAR_FILTER_LABELS[category]}</strong>
                <span>{IMPORT_CATEGORY_HINTS[category]}</span>
              </button>
            ))}
          </div>
          <div className="reading-library__import-actions">
            <button
              className="reading-library__import-primary"
              disabled={isImporting}
              onClick={openFilePicker}
              type="button"
            >
              {isImporting
                ? "导入中..."
                : `选择文件并导入到「${READING_SIDEBAR_FILTER_LABELS[importCategory]}」`}
            </button>
            <button
              className="reading-library__import-ghost"
              disabled={isImporting}
              onClick={() =>
                router.replace(readingLibraryHref(READING_CURATED_CHILD_FILTERS[0]), {
                  scroll: false,
                })
              }
              type="button"
            >
              取消
            </button>
          </div>
          {importMessage ? (
            <p className="reading-library__import-message">{importMessage}</p>
          ) : null}
          <p className="reading-library__import-note">
            仅支持 Markdown（.md）。英文段后空一行再写中文，会自动左英右中。
          </p>
        </section>

        <input
          accept={READING_IMPORT_ACCEPT}
          className="reading-library__file-input"
          onChange={(event) => void handleImportFileChange(event)}
          ref={fileInputRef}
          type="file"
        />
      </main>
    );
  }

  return (
    <main className="reading-library">
      <header className="reading-library__topbar">
        <div>
          <p className="reading-library__kicker">Reading Library</p>
          <h1>Curated Reads</h1>
        </div>
      </header>

      {visibleSources.length === 0 ? (
        <p className="reading-library__empty">这个分类下还没有内容。</p>
      ) : null}

      {continueReading ? (
        <article
          className="reading-library__featured"
          onClick={() => onOpen(continueReading.id)}
          onKeyDown={(event) => {
            if (isNestedButtonEvent(event)) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(continueReading.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="reading-library__featured-body">
            <span className="reading-library__eyebrow">
              {getProgressLabel(resolveProgress(continueReading))}
            </span>
            <h2>{continueReading.title}</h2>
            {continueReading.summary ? <p>{continueReading.summary}</p> : null}
          </div>
          <span className="reading-library__featured-cta">
            {getProgressLabel(resolveProgress(continueReading))} ·{" "}
            {continueReading.estimatedMinutes} min
          </span>
          <button
            aria-label={`删除 ${continueReading.title}`}
            className="reading-library__delete"
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteSource(continueReading.id);
            }}
            type="button"
          >
            <TrashIcon />
          </button>
        </article>
      ) : null}

      {groups.map((group) => (
        <section className="reading-library__group" key={group.date || "ungrouped"}>
          <div className="reading-library__group-label">
            <time dateTime={group.date || undefined}>{group.label}</time>
          </div>
          {group.sources.map((source) => {
            const progress = resolveProgress(source);
            return (
              <article
                className="reading-library__card"
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
                <div className="reading-library__card-main">
                  <div className="reading-library__card-head">
                    <h3>{source.title}</h3>
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
                  {source.author ? (
                    <p className="reading-library__author">{source.author}</p>
                  ) : null}
                  {source.summary ? (
                    <p className="reading-library__summary">{source.summary}</p>
                  ) : null}
                  <div className="reading-library__meta">
                    <span
                      className="reading-library__status"
                      data-done={progress >= 100 ? "true" : "false"}
                    >
                      {getProgressLabel(progress)}
                    </span>
                    <span>·</span>
                    <span>{source.estimatedMinutes} min</span>
                    <span>·</span>
                    <span>
                      {source.format === "pdf"
                        ? `${source.pageCount ?? "?"} pages`
                        : `${getTotalWords(source)} words`}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ))}
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
