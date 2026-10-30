"use client";

import { useState } from "react";
import { NotesFileTree } from "./notes-file-tree";
import type { NotesWorkbenchProps } from "./notes-workbench";

type Props = Pick<NotesWorkbenchProps,
  "activePath" | "entries" | "directoryInfo" | "onOpenPath" | "onCreateNoteInPath" |
  "onCreateFolderInPath" | "onDeletePath" | "onRenamePath" | "onRevealPath" |
  "onMovePath" | "onCopyPath" | "onPickDirectory" | "onRefresh" | "isLoading"
> & { onCollapse: () => void; onOpenFile?: () => void };

/** Reuses Auris's vault operations; the explorer never writes files itself. */
export function NotesExplorer({ onCollapse, onOpenFile, onRefresh, isLoading, directoryInfo, onPickDirectory, ...tree }: Props) {
  const [query, setQuery] = useState("");
  const configured = directoryInfo?.isConfigured !== false;
  const needle = query.trim().toLocaleLowerCase();
  const entries = needle
    ? tree.entries.filter((entry) => entry.path.toLocaleLowerCase().includes(needle))
    : tree.entries;

  return (
    <aside aria-label="笔记文件栏" className="notes-explorer">
      <header className="notes-explorer__header">
        <span title={directoryInfo?.vaultPath ?? undefined}>{directoryInfo?.directoryName ?? "笔记"}</span>
        <button type="button" aria-label="收起文件栏" title="收起文件栏" onClick={onCollapse}>‹</button>
      </header>
      <div className="notes-explorer__actions" role="toolbar" aria-label="文件操作">
        <button type="button" disabled={!configured || isLoading} onClick={() => tree.onCreateNoteInPath?.("")} title="新建 Markdown 文件" aria-label="新建 Markdown 文件">＋ 文档</button>
        <button type="button" disabled={!configured || isLoading} onClick={() => tree.onCreateFolderInPath?.("")} title="新建文件夹" aria-label="新建文件夹">＋ 文件夹</button>
        <button type="button" onClick={onRefresh} disabled={isLoading} title="刷新文件" aria-label="刷新文件">↻</button>
      </div>
      <label className="notes-explorer__search">
        <span className="notes-v2__sr-only">筛选文件</span>
        <input type="search" placeholder="筛选文件…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="notes-explorer__files" aria-busy={isLoading}>
        {!configured ? (
          <div className="notes-explorer__empty"><p>打开一个文件夹，开始写作。</p><button type="button" onClick={onPickDirectory}>打开笔记文件夹</button></div>
        ) : isLoading && !tree.entries.length ? <p className="notes-explorer__hint" role="status">正在加载文件…</p> : (
          <>
            <NotesFileTree {...tree} entries={entries} key={directoryInfo?.vaultPath ?? "vault"} variant="obsidian" />
            {!entries.length ? <p className="notes-explorer__hint">{needle ? "没有匹配的文件" : "文件夹为空，点击上方新建文档。"}</p> : null}
          </>
        )}
      </div>
      <footer className="notes-explorer__footer">
        <button type="button" onClick={onPickDirectory} title="打开其他笔记文件夹">打开文件夹</button>
        {onOpenFile ? <button type="button" onClick={onOpenFile}>打开 .md</button> : null}
      </footer>
    </aside>
  );
}
