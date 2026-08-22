"use client";

import {
  FilePlus,
  FileText,
  FolderSimple,
  List,
  MagnifyingGlass,
  SortAscending,
  SquaresFour,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type {
  NotesFolderLocation,
  NotesLocation,
} from "@/components/notes-v2/notes-navigation";

type NotesBrowserView = "grid" | "list";
type NotesBrowserSort = "modified-desc" | "modified-asc" | "name-asc" | "name-desc";

type NotesFolderBrowserProps = {
  documents: NoteDocument[];
  errorMessage?: string | null;
  folder: NotesFolderLocation;
  isLoading?: boolean;
  isReady: boolean;
  onCreateNote: () => void;
  onEnsureDocuments: () => Promise<void>;
  onOpenNote: (path: string) => void;
  theme: string;
};

const SORT_LABELS: Record<NotesBrowserSort, string> = {
  "modified-desc": "最近修改",
  "modified-asc": "最早修改",
  "name-asc": "名称 A-Z",
  "name-desc": "名称 Z-A",
};

const VIEW_MODE_STORAGE_KEY = "auris.notes.folder-browser-view";

function readViewMode(): NotesBrowserView {
  if (typeof window === "undefined") return "grid";

  try {
    const value = window.sessionStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return value === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function saveViewMode(viewMode: NotesBrowserView) {
  try {
    window.sessionStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  } catch {
    // 无存储权限时仍保留当前 React 会话状态。
  }
}

function titleFor(document: NoteDocument) {
  return document.parsed.title?.trim() || document.basename || document.fileName;
}

function previewFor(document: NoteDocument) {
  const lines = document.rawSource
    .split(/\r?\n/u)
    .map((line) => line.replace(/^#{1,6}\s+/u, "").trim())
    .filter((line) => line && line !== "---" && !line.startsWith("title:"));

  const title = document.parsed.title?.trim();
  const preview = lines.filter((line) => line !== title).slice(0, 2).join(" ");
  // 没有预览时保留空字符串。布局由固定高度的预览区域维持，避免用重复的
  // 占位文案制造视觉噪音。
  return preview;
}

function toTimestamp(value: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return null;

  const now = Date.now();
  const diff = now - updatedAt.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (diff >= 0 && diff < hour) return "刚刚更新";
  if (diff >= hour && diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff >= day && diff < 2 * day) return "昨天";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(updatedAt);
}

function describeDocument(document: NoteDocument): string | null {
  const relativeDirectory = document.path.split("/").slice(0, -1).join("/");
  // 文件就在 Vault 根目录时没有额外的定位价值，省略而不是填入占位文本。
  return relativeDirectory || null;
}

function fileTypeLabel(document: NoteDocument) {
  const formatId = document.formatId?.trim();
  if (formatId === "markdown") return "MD";
  return formatId?.slice(0, 4).toLocaleUpperCase("en-US") || "FILE";
}

function sortDocuments(documents: NoteDocument[], sort: NotesBrowserSort) {
  const sorted = [...documents];

  sorted.sort((left, right) => {
    if (sort === "name-asc" || sort === "name-desc") {
      const result = titleFor(left).localeCompare(titleFor(right), "zh-CN");
      return sort === "name-asc" ? result : -result;
    }

    const result = toTimestamp(right.mtime) - toTimestamp(left.mtime);
    return sort === "modified-desc" ? result : -result;
  });

  return sorted;
}

function NotesFolderSkeleton() {
  return (
    <div aria-label="正在加载文件夹内容" className="notes-folder-browser__skeleton" role="status">
      <span className="notes-folder-browser__skeleton-line notes-folder-browser__skeleton-line--wide" />
      <span className="notes-folder-browser__skeleton-line notes-folder-browser__skeleton-line--short" />
      <div className="notes-folder-browser__skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="notes-folder-browser__skeleton-card" key={index} />
        ))}
      </div>
    </div>
  );
}

function NotesDocumentCard({
  document,
  onOpen,
}: {
  document: NoteDocument;
  onOpen: () => void;
}) {
  const title = titleFor(document);
  const preview = previewFor(document);
  const updatedAt = formatUpdatedAt(document.mtime);
  const fileType = fileTypeLabel(document);

  return (
    <button
      aria-label={`打开笔记 ${title}`}
      className="notes-folder-browser__card"
      data-file-kind={document.formatId}
      onClick={onOpen}
      title={title}
      type="button"
    >
      <span className="notes-folder-browser__card-title-row">
        <FileText aria-hidden="true" size={19} weight="duotone" />
        <strong>{title}</strong>
      </span>
      <span className="notes-folder-browser__card-main">
        <span
          className="notes-folder-browser__card-preview"
          data-empty={preview ? "false" : "true"}
        >
          {preview}
        </span>
      </span>
      <span className="notes-folder-browser__card-footer">
        <span className="notes-folder-browser__card-meta">
          {updatedAt ? <span>{updatedAt}</span> : null}
          {updatedAt ? <span aria-hidden="true">·</span> : null}
          <span>{fileType}</span>
        </span>
      </span>
    </button>
  );
}

function NotesDocumentRow({
  document,
  onOpen,
}: {
  document: NoteDocument;
  onOpen: () => void;
}) {
  const title = titleFor(document);
  const directory = describeDocument(document);
  const updatedAt = formatUpdatedAt(document.mtime);
  const fileType = fileTypeLabel(document);

  return (
    <button
      aria-label={`打开笔记 ${title}`}
      className="notes-folder-browser__row"
      data-file-kind={document.formatId}
      onClick={onOpen}
      title={title}
      type="button"
    >
      <span className="notes-folder-browser__row-name">
        <FileText aria-hidden="true" size={18} weight="duotone" />
        <span>
          <strong>{title}</strong>
          {directory ? <small>{directory}</small> : null}
        </span>
      </span>
      {updatedAt ? (
        <span className="notes-folder-browser__row-modified">{updatedAt}</span>
      ) : (
        <span aria-hidden="true" className="notes-folder-browser__row-modified" />
      )}
      <span className="notes-folder-browser__row-type">{fileType}</span>
    </button>
  );
}

export function NotesFolderBrowser({
  documents,
  errorMessage = null,
  folder,
  isLoading = false,
  isReady,
  onCreateNote,
  onEnsureDocuments,
  onOpenNote,
  theme,
}: NotesFolderBrowserProps) {
  const [viewMode, setViewMode] = useState<NotesBrowserView>("grid");
  const [sortMode, setSortMode] = useState<NotesBrowserSort>("modified-desc");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPreparingDocuments, setIsPreparingDocuments] = useState(false);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;
    setIsPreparingDocuments(true);
    void onEnsureDocuments().finally(() => {
      if (!cancelled) setIsPreparingDocuments(false);
    });

    return () => {
      cancelled = true;
    };
  }, [folder.id, isReady, onEnsureDocuments]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
    const matching = normalizedQuery
      ? documents.filter((document) =>
          [titleFor(document), document.fileName, document.path]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery),
        )
      : documents;

    return sortDocuments(matching, sortMode);
  }, [documents, searchQuery, sortMode]);

  const setStoredViewMode = (nextMode: NotesBrowserView) => {
    setViewMode(nextMode);
    saveViewMode(nextMode);
  };

  const isLoadingFolder = !isReady || isLoading || isPreparingDocuments;
  const showError = !isReady && Boolean(errorMessage) && !isLoading;

  return (
    <main
      className="notes-v2 notes-v2--folder-browser"
      data-notes-theme={theme}
      data-view-mode={viewMode}
    >
      <div className="notes-folder-browser__inner">
        <header className="notes-folder-browser__header">
          <div className="notes-folder-browser__identity">
            <p className="notes-folder-browser__eyebrow">文件夹</p>
            <h1>{folder.name}</h1>
            <p className="notes-folder-browser__breadcrumb">Notes / {folder.name}</p>
          </div>
          <div className="notes-folder-browser__tools">
            {searchOpen ? (
              <label className="notes-folder-browser__search">
                <MagnifyingGlass aria-hidden="true" size={17} />
                <input
                  autoFocus
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={`在 ${folder.name} 中搜索…`}
                  type="search"
                  value={searchQuery}
                />
                <button
                  aria-label="关闭文件夹搜索"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  type="button"
                >
                  <X aria-hidden="true" size={15} />
                </button>
              </label>
            ) : (
              <button
                aria-label={`搜索 ${folder.name} 中的文件`}
                className="notes-folder-browser__tool-button"
                onClick={() => setSearchOpen(true)}
                type="button"
              >
                <MagnifyingGlass aria-hidden="true" size={17} />
                <span>搜索</span>
              </button>
            )}
            <label className="notes-folder-browser__sort">
              <SortAscending aria-hidden="true" size={17} />
              <span className="notes-folder-browser__sr-only">排序方式</span>
              <select
                aria-label="排序方式"
                onChange={(event) => setSortMode(event.target.value as NotesBrowserSort)}
                value={sortMode}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <div aria-label="文件显示方式" className="notes-folder-browser__view-switcher" role="group">
              <button
                aria-label="网格视图"
                aria-pressed={viewMode === "grid"}
                data-active={viewMode === "grid" ? "true" : "false"}
                onClick={() => setStoredViewMode("grid")}
                type="button"
              >
                <SquaresFour aria-hidden="true" size={18} weight="bold" />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={viewMode === "list"}
                data-active={viewMode === "list" ? "true" : "false"}
                onClick={() => setStoredViewMode("list")}
                type="button"
              >
                <List aria-hidden="true" size={18} weight="bold" />
              </button>
            </div>
          </div>
        </header>

        {showError ? (
          <section className="notes-folder-browser__state" role="alert">
            <WarningCircle aria-hidden="true" size={28} weight="duotone" />
            <h2>无法打开此文件夹</h2>
            <p>此文件夹可能已移动、删除或暂时不可访问。请从侧边栏重新选择文件夹。</p>
          </section>
        ) : isLoadingFolder ? (
          <NotesFolderSkeleton />
        ) : filteredDocuments.length ? (
          <section aria-label={`${folder.name} 文件`} className="notes-folder-browser__content">
            <div className="notes-folder-browser__content-heading">
              <span>{SORT_LABELS[sortMode]}</span>
              <small>{searchQuery ? `${filteredDocuments.length} 个匹配项` : `${filteredDocuments.length} 个文件`}</small>
            </div>
            {viewMode === "grid" ? (
              <div className="notes-folder-browser__grid">
                {filteredDocuments.map((document) => (
                  <NotesDocumentCard
                    document={document}
                    key={document.path}
                    onOpen={() => onOpenNote(document.path)}
                  />
                ))}
              </div>
            ) : (
              <div className="notes-folder-browser__list">
                <div aria-hidden="true" className="notes-folder-browser__list-heading">
                  <span>名称</span>
                  <span className="notes-folder-browser__list-heading-modified">更新</span>
                  <span className="notes-folder-browser__list-heading-type">类型</span>
                </div>
                {filteredDocuments.map((document) => (
                  <NotesDocumentRow
                    document={document}
                    key={document.path}
                    onOpen={() => onOpenNote(document.path)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : searchQuery ? (
          <section className="notes-folder-browser__state">
            <MagnifyingGlass aria-hidden="true" size={28} weight="duotone" />
            <h2>没有匹配的笔记</h2>
            <p>请尝试名称或文件路径中的其他关键词。</p>
          </section>
        ) : (
          <section className="notes-folder-browser__state">
            <FolderSimple aria-hidden="true" size={30} weight="duotone" />
            <h2>这里还没有笔记</h2>
            <p>在这个文件夹中创建第一篇笔记。</p>
            <button className="notes-folder-browser__new-note" onClick={onCreateNote} type="button">
              <FilePlus aria-hidden="true" size={17} weight="bold" />
              <span>新建笔记</span>
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export type { NotesBrowserSort, NotesBrowserView, NotesLocation };
