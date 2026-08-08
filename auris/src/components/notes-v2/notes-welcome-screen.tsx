"use client";

import {
  Clock,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
} from "@phosphor-icons/react";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesReadingThemeId } from "@/features/notes/workbench/notes-reading-theme";

type NotesWelcomeScreenProps = {
  documents: NoteDocument[];
  recentFiles: string[];
  theme: NotesReadingThemeId;
  onCreateFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onOpenRecent: (path: string) => void;
};

function displayName(path: string, documents: NoteDocument[]) {
  return documents.find((document) => document.path === path)?.parsed.title ||
    path.split("/").at(-1) ||
    path;
}

export function NotesWelcomeScreen({
  documents,
  recentFiles,
  theme,
  onCreateFile,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
}: NotesWelcomeScreenProps) {
  return (
    <main className="notes-v2 notes-v2--welcome" data-notes-theme={theme}>
      <div className="notes-welcome__inner">
        <header className="notes-welcome__header">
          <div className="notes-welcome__mark" aria-hidden="true">A</div>
          <div>
            <p className="notes-welcome__eyebrow">AURIS NOTES</p>
            <h1>开始你的下一页笔记</h1>
            <p className="notes-welcome__subtitle">在本地打开一个 Vault，继续专注写作。</p>
          </div>
        </header>

        <section aria-label="文件操作" className="notes-welcome__actions">
          <button className="notes-welcome__action notes-welcome__action--primary" onClick={onCreateFile} type="button">
            <FilePlus size={22} weight="duotone" />
            <span><strong>新建文件</strong><small>在当前 Vault 中创建笔记</small></span>
          </button>
          <button className="notes-welcome__action" onClick={onOpenFile} type="button">
            <FileText size={22} weight="duotone" />
            <span><strong>打开文件</strong><small>从电脑中选择 Markdown 文件</small></span>
          </button>
          <button className="notes-welcome__action" onClick={onOpenFolder} type="button">
            <FolderOpen size={22} weight="duotone" />
            <span><strong>打开文件夹</strong><small>选择一个本地笔记 Vault</small></span>
          </button>
        </section>

        <section aria-label="最近使用文件" className="notes-welcome__recent">
          <div className="notes-welcome__section-heading">
            <span><Clock size={16} /> 最近使用</span>
            <small>{recentFiles.length ? `${recentFiles.length} 个文件` : "还没有文件"}</small>
          </div>
          {recentFiles.length ? (
            <div className="notes-welcome__recent-list">
              {recentFiles.slice(0, 8).map((path) => (
                <button className="notes-welcome__recent-item" key={path} onClick={() => onOpenRecent(path)} type="button">
                  <FileText size={17} />
                  <span><strong>{displayName(path, documents)}</strong><small>{path}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="notes-welcome__empty"><FolderPlus size={20} /><span>打开或新建文件后，最近使用文件会显示在这里。</span></div>
          )}
        </section>
      </div>
    </main>
  );
}
