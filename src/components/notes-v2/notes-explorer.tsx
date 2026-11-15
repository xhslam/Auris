"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowsInLineVertical, CaretLeft, CaretUpDown, SortAscending, SortDescending, GearSix, Command, DotsThree, FilePlus, FolderOpen, FolderPlus, ArrowClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { NotesFileTree, type NotesFileTreeHandle } from "./notes-file-tree";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { isHiddenVaultPath, isSystemVaultFile } from "@/features/notes/vault/vault-path";
import type { NotesWorkbenchProps } from "./notes-workbench";

type Props = Pick<NotesWorkbenchProps,
  "activePath" | "entries" | "directoryInfo" | "onOpenPath" | "onCreateNoteInPath" |
  "onCreateFolderInPath" | "onDeletePath" | "onRenamePath" | "onRevealPath" |
  "onMovePath" | "onCopyPath" | "onPickDirectory" | "onRefresh" | "isLoading"
> & { onCollapse: () => void; onOpenFile?: () => void; onOpenCommands?: () => void };

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Reuses Auris's vault operations; the explorer never writes files itself. */
export function NotesExplorer({ onCollapse, onOpenFile, onOpenCommands, onRefresh, isLoading, directoryInfo, onPickDirectory, ...tree }: Props) {
  // Native vault status is client-only. Keep initial SSR/client chrome identical.
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const resolvedDirectoryInfo = hydrated ? directoryInfo : undefined;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortDescending, setSortDescending] = useState(false);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const treeRef = useRef<NotesFileTreeHandle>(null);
  const isExplicitlyUnconfigured =
    resolvedDirectoryInfo?.connectionStatus === "unconfigured" ||
    (resolvedDirectoryInfo &&
      resolvedDirectoryInfo.connectionStatus !== "unknown" &&
      resolvedDirectoryInfo.isConfigured === false);
  const isConnecting =
    !hydrated || (resolvedDirectoryInfo?.connectionStatus === "unknown" && !tree.entries.length);
  const configured = !isExplicitlyUnconfigured && !isConnecting;
  const needle = query.trim().toLocaleLowerCase();
  const visibleEntries = useMemo(
    () =>
      tree.entries.filter(
        (entry) =>
          !isHiddenVaultPath(entry.path) &&
          !(entry.kind === "file" && isSystemVaultFile(entry.path)) &&
          (entry.kind === "directory" ||
            getFormatDescriptor(entry.path).id === "markdown" ||
            /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svgz?|tiff?|webp)$/i.test(
              entry.path,
            )),
      ),
    [tree.entries],
  );
  const entries = useMemo(
    () =>
      needle
        ? visibleEntries.filter((entry) =>
            entry.path.toLocaleLowerCase().includes(needle),
          )
        : visibleEntries,
    [needle, visibleEntries],
  );
  const closeMenu = (restoreFocus = false) => {
    if (!menuRef.current) return;
    menuRef.current.open = false;
    if (restoreFocus) menuRef.current.querySelector("summary")?.focus();
  };
  const clearSearch = () => { setQuery(""); searchRef.current?.focus(); };

  return (
    <aside aria-label="笔记文件栏" className="notes-explorer">
      <div className="notes-explorer__actions" role="toolbar" aria-label="文件操作">
        <button type="button" disabled={!configured || !tree.onCreateNoteInPath} onClick={() => tree.onCreateNoteInPath?.("")} title="新建 Markdown 文件" aria-label="新建 Markdown 文件"><FilePlus size={18} aria-hidden="true" /></button>
        <button type="button" disabled={!configured || !tree.onCreateFolderInPath} onClick={() => tree.onCreateFolderInPath?.("")} title="新建文件夹" aria-label="新建文件夹"><FolderPlus size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="按名称倒序排列" aria-pressed={sortDescending} title={sortDescending ? "名称：Z → A，点击切换" : "名称：A → Z，点击切换"} onClick={() => setSortDescending((value) => !value)}>{sortDescending ? <SortDescending size={18} aria-hidden="true" /> : <SortAscending size={18} aria-hidden="true" />}</button>
        <button type="button" disabled={!configured} title="折叠全部文件夹" aria-label="折叠全部文件夹" onClick={() => treeRef.current?.collapseAll()}><ArrowsInLineVertical size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="筛选文件" title="筛选文件" aria-expanded={searchOpen} aria-controls={searchId} onClick={() => { setSearchOpen((open) => !open); setQuery(""); }}><MagnifyingGlass size={18} aria-hidden="true" /></button>
        <details ref={menuRef} className="notes-explorer__more" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(); }} onKeyDown={(event) => { if (event.key === "Escape") { closeMenu(true); } }}>
          <summary title="更多文件操作"><DotsThree size={18} aria-hidden="true" /><span className="notes-v2__sr-only">更多文件操作</span></summary>
          <div className="notes-explorer__menu">
            <button type="button" onClick={() => { onRefresh?.(); closeMenu(true); }} disabled={isLoading || !onRefresh} title="刷新文件" aria-label="刷新文件"><ArrowClockwise size={16} aria-hidden="true" />刷新文件</button>
            <button type="button" onClick={() => { onPickDirectory?.(); closeMenu(true); }} disabled={!onPickDirectory}><FolderOpen size={16} aria-hidden="true" />打开笔记文件夹</button>
            {onOpenFile ? <button type="button" onClick={() => { onOpenFile(); closeMenu(true); }}><FilePlus size={16} aria-hidden="true" />打开 Markdown 文件</button> : null}
          </div>
        </details>
        <button type="button" className="notes-explorer__icon-button" aria-label="收起文件栏" title="收起文件栏" onClick={onCollapse}><CaretLeft size={16} aria-hidden="true" /></button>
      </div>
      <div className="notes-explorer__search" hidden={!searchOpen}>
        <MagnifyingGlass size={16} aria-hidden="true" />
        <label className="notes-v2__sr-only" htmlFor={searchId}>筛选文件</label>
        <input id={searchId} ref={searchRef} type="search" placeholder="筛选文件…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (query) clearSearch(); else { setSearchOpen(false); event.currentTarget.closest("aside")?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus(); } } }} />
        {query ? <button type="button" className="notes-explorer__icon-button" title="清空筛选" aria-label="清空筛选" onClick={clearSearch}><X size={12} aria-hidden="true" /></button> : null}
      </div>
      <div className="notes-explorer__files" aria-busy={isLoading}>
        {isExplicitlyUnconfigured ? (
          <div className="notes-explorer__empty"><p>打开一个文件夹，开始写作。</p><button type="button" onClick={onPickDirectory}>打开笔记文件夹</button></div>
        ) : isConnecting ? (
          <p className="notes-explorer__hint" role="status">正在连接笔记库…</p>
        ) : isLoading && !tree.entries.length ? <p className="notes-explorer__hint" role="status">正在加载文件…</p> : (
          <>
            <NotesFileTree {...tree} ref={treeRef} entries={entries} filterActive={Boolean(needle)} rowHeight={34} indentWidth={20} sortDescending={sortDescending} key={resolvedDirectoryInfo?.vaultPath ?? "vault"} variant="obsidian" />
            {!entries.length ? <p className="notes-explorer__hint" role="status">{needle ? "没有匹配的文件" : "文件夹为空，点击上方新建文档。"}</p> : null}
          </>
        )}
      </div>
      <footer className="notes-explorer__footer">
        <button type="button" className="notes-explorer__vault" onClick={onPickDirectory} disabled={!onPickDirectory} aria-label="切换笔记库" title={resolvedDirectoryInfo?.vaultPath ?? "打开笔记文件夹"}>
          <CaretUpDown size={16} aria-hidden="true" /><span className="notes-explorer__title">{resolvedDirectoryInfo?.directoryName ?? "打开笔记文件夹"}</span>
        </button>
        {onOpenCommands ? <button type="button" className="notes-explorer__icon-button" onClick={onOpenCommands} aria-label="命令与快捷键" title="命令与快捷键"><Command size={18} aria-hidden="true" /></button> : null}
        <Link className="notes-explorer__icon-button" href="/settings" aria-label="设置" title="设置"><GearSix size={18} aria-hidden="true" /></Link>
      </footer>
    </aside>
  );
}
