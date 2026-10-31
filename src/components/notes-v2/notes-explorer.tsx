"use client";

import { useId, useRef, useState } from "react";
import { ArrowsInLineVertical, CaretLeft, DotsThree, FilePlus, FolderOpen, FolderPlus, ArrowClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { NotesFileTree, type NotesFileTreeHandle } from "./notes-file-tree";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { isHiddenVaultPath, isSystemVaultFile } from "@/features/notes/vault/vault-path";
import type { NotesWorkbenchProps } from "./notes-workbench";

type Props = Pick<NotesWorkbenchProps,
  "activePath" | "entries" | "directoryInfo" | "onOpenPath" | "onCreateNoteInPath" |
  "onCreateFolderInPath" | "onDeletePath" | "onRenamePath" | "onRevealPath" |
  "onMovePath" | "onCopyPath" | "onPickDirectory" | "onRefresh" | "isLoading"
> & { onCollapse: () => void; onOpenFile?: () => void };

/** Reuses Auris's vault operations; the explorer never writes files itself. */
export function NotesExplorer({ onCollapse, onOpenFile, onRefresh, isLoading, directoryInfo, onPickDirectory, ...tree }: Props) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const treeRef = useRef<NotesFileTreeHandle>(null);
  const configured = directoryInfo?.isConfigured !== false;
  const needle = query.trim().toLocaleLowerCase();
  const visibleEntries = tree.entries.filter((entry) =>
    !isHiddenVaultPath(entry.path) && !(entry.kind === "file" && isSystemVaultFile(entry.path)) &&
    (entry.kind === "directory" || getFormatDescriptor(entry.path).id === "markdown" ||
    /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svgz?|tiff?|webp)$/i.test(entry.path)),
  );
  const entries = needle
    ? visibleEntries.filter((entry) => entry.path.toLocaleLowerCase().includes(needle))
    : visibleEntries;
  const closeMenu = (restoreFocus = false) => {
    if (!menuRef.current) return;
    menuRef.current.open = false;
    if (restoreFocus) menuRef.current.querySelector("summary")?.focus();
  };
  const clearSearch = () => { setQuery(""); searchRef.current?.focus(); };

  return (
    <aside aria-label="笔记文件栏" className="notes-explorer">
      <header className="notes-explorer__header">
        <div className="notes-explorer__heading">
          <span className="notes-explorer__eyebrow">当前笔记库</span>
          <span className="notes-explorer__title" title={directoryInfo?.vaultPath ?? undefined}>{directoryInfo?.directoryName ?? "笔记"}</span>
        </div>
        <button type="button" className="notes-explorer__icon-button" aria-label="收起文件栏" title="收起文件栏" onClick={onCollapse}><CaretLeft size={16} aria-hidden="true" /></button>
      </header>
      <div className="notes-explorer__actions" role="toolbar" aria-label="文件操作">
        <button type="button" disabled={!configured || isLoading || !tree.onCreateNoteInPath} onClick={() => tree.onCreateNoteInPath?.("")} title="新建 Markdown 文件" aria-label="新建 Markdown 文件"><FilePlus size={16} aria-hidden="true" /><span>文档</span></button>
        <button type="button" disabled={!configured || isLoading || !tree.onCreateFolderInPath} onClick={() => tree.onCreateFolderInPath?.("")} title="新建文件夹" aria-label="新建文件夹"><FolderPlus size={16} aria-hidden="true" /><span>文件夹</span></button>
        <details ref={menuRef} className="notes-explorer__more" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(); }} onKeyDown={(event) => { if (event.key === "Escape") { closeMenu(true); } }}>
          <summary title="更多文件操作"><DotsThree size={20} aria-hidden="true" /><span className="notes-v2__sr-only">更多文件操作</span></summary>
          <div className="notes-explorer__menu">
            <button type="button" onClick={() => { treeRef.current?.collapseAll(); closeMenu(true); }} disabled={!configured || isLoading} title="折叠全部文件夹" aria-label="折叠全部文件夹"><ArrowsInLineVertical size={16} aria-hidden="true" />折叠全部文件夹</button>
            <button type="button" onClick={() => { onRefresh?.(); closeMenu(true); }} disabled={isLoading || !onRefresh} title="刷新文件" aria-label="刷新文件"><ArrowClockwise size={16} aria-hidden="true" />刷新文件</button>
          </div>
        </details>
      </div>
      <div className="notes-explorer__search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <label className="notes-v2__sr-only" htmlFor={searchId}>筛选文件</label>
        <input id={searchId} ref={searchRef} type="search" placeholder="筛选文件…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.stopPropagation(); clearSearch(); } }} />
        {query ? <button type="button" className="notes-explorer__icon-button" title="清空筛选" aria-label="清空筛选" onClick={clearSearch}><X size={12} aria-hidden="true" /></button> : null}
      </div>
      <div className="notes-explorer__files" aria-busy={isLoading}>
        {!configured ? (
          <div className="notes-explorer__empty"><p>打开一个文件夹，开始写作。</p><button type="button" onClick={onPickDirectory}>打开笔记文件夹</button></div>
        ) : isLoading && !tree.entries.length ? <p className="notes-explorer__hint" role="status">正在加载文件…</p> : (
          <>
            <NotesFileTree {...tree} ref={treeRef} entries={entries} filterActive={Boolean(needle)} showIcons key={directoryInfo?.vaultPath ?? "vault"} variant="obsidian" />
            {!entries.length ? <p className="notes-explorer__hint" role="status">{needle ? "没有匹配的文件" : "文件夹为空，点击上方新建文档。"}</p> : null}
          </>
        )}
      </div>
      <footer className="notes-explorer__footer">
        <button type="button" onClick={onPickDirectory} title="打开其他笔记文件夹"><FolderOpen size={16} aria-hidden="true" />打开文件夹</button>
        {onOpenFile ? <button type="button" onClick={onOpenFile} title="打开 Markdown 文件"><FilePlus size={16} aria-hidden="true" />打开 .md</button> : null}
      </footer>
    </aside>
  );
}
