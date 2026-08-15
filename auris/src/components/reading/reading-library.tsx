"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, MagnifyingGlass, UploadSimple } from "@phosphor-icons/react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

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

  const searchedSources = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return visibleSources.filter((source) => {
      const searchable = [source.title, source.author, source.summary, source.kicker]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const hasTranslation = source.paragraphs.some(
        (paragraph) => paragraph.translation && paragraph.translation !== "placeholder",
      );
      const matchesLanguage =
        languageFilter === "all" ||
        languageFilter === "english" ||
        (languageFilter === "bilingual" && hasTranslation);
      return matchesLanguage && (!query || searchable.includes(query));
    });
  }, [languageFilter, searchQuery, visibleSources]);

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

  return (
    <main className="reading-library">
      <header className="reading-library__topbar">
        <div>
          <p className="reading-library__kicker">Your reading room</p>
          <h1>Ebooks</h1>
          <p className="reading-library__count">
            {searchedSources.length} {searchedSources.length === 1 ? "ebook" : "ebooks"}
          </p>
        </div>
        <div className="reading-library__import-controls">
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

      <section aria-label="Search and language filters" className="reading-library__filters">
        <label className="reading-library__search">
          <MagnifyingGlass aria-hidden="true" />
          <span className="reading-library__visually-hidden">Search ebooks</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by title, author, or topic"
            ref={searchInputRef}
            type="search"
            value={searchQuery}
          />
          <kbd>⌘ K</kbd>
        </label>
        <label className="reading-library__language">
          <span className="reading-library__visually-hidden">Language</span>
          <select onChange={(event) => setLanguageFilter(event.target.value)} value={languageFilter}>
            <option value="all">All languages</option>
            <option value="english">English</option>
            <option value="bilingual">English + Chinese</option>
          </select>
        </label>
      </section>

      {searchedSources.length === 0 ? (
        <div className="reading-library__empty">
          <BookOpen />
          <strong>No books found</strong>
          <span>Try a different search, or import a Markdown/PDF book.</span>
        </div>
      ) : null}

      <section aria-label="Ebook shelf" className="reading-library__shelf">
        {searchedSources.map((source, index) => {
            const progress = resolveProgress(source);
            return (
              <article
                className="reading-library__card"
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
                <div className="reading-library__cover">
                  <div aria-hidden="true" className="reading-library__cover-art">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="reading-library__cover-icon"><BookOpen /></div>
                  <div className="reading-library__cover-copy">
                    <span>{source.category === "exam" ? "Study edition" : source.kicker}</span>
                    <h2>{source.title}</h2>
                    <p>{source.author || "Imported by you"}</p>
                  </div>
                  <div className="reading-library__cover-progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="reading-library__card-info">
                  <div>
                    <p>{source.author || "Imported by you"}</p>
                  </div>
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
                {source.publishedAt ? (
                  <time className="reading-library__visually-hidden" dateTime={source.publishedAt}>
                    {source.publishedAt.replaceAll("-", ".")}
                  </time>
                ) : null}
              </article>
            );
          })}
      </section>

      <input
        accept={READING_IMPORT_ACCEPT}
        className="reading-library__file-input"
        onChange={(event) => void handleImportFileChange(event)}
        ref={fileInputRef}
        type="file"
      />
      {importMessage ? <p className="reading-library__import-message">{importMessage}</p> : null}
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
