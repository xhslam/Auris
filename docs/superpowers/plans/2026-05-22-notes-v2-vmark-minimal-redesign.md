# notes-v2 VMark Minimal Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved VMark-like notes-v2 shell: a quiet full-window editor canvas with bottom-left document controls, bottom-right status/tool controls, and temporary popovers instead of persistent top/side panels.

**Architecture:** Keep the existing notes editor and panel components, but replace the always-visible `NotesLayout` chrome path in `NotesWorkbench` with a new minimal chrome layer. New focused bottom-corner components own their local UI and reuse `NotesFileTree`, `NotesSearchPanel`, `NotesOutlinePanel`, `NotesBacklinksPanel`, `NotesPropertiesPanel`, `NotesLearningPanel`, and `NotesTerminalPanel` as popover content. Existing workbench state and callbacks remain the source of truth.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing CSS in `src/app/globals.css`, Vitest/Playwright where available.

---

## File Structure

- Verify existing: `english-shadowing-web/src/components/notes-v2/notes-workbench-popover.tsx`
  - Shared anchored popover shell with outside-click and `Esc` handling. File already exists — confirm it matches the spec before proceeding.
- Create: `english-shadowing-web/src/components/notes-v2/notes-workbench-bottom-left.tsx`
  - Bottom-left VMark-like controls: files icon, new-note icon, active-document pill, and workspace popover.
- Create: `english-shadowing-web/src/components/notes-v2/notes-workbench-bottom-right.tsx`
  - Bottom-right VMark-like controls: word/character count, status icons, learning/backlinks/properties/terminal popovers, source/rich toggle, overflow actions.
- Modify: `english-shadowing-web/src/components/notes-v2/notes-workbench-center.tsx`
  - Add a prop to hide the old tab/toolbar strip in minimal chrome mode.
- Modify: `english-shadowing-web/src/components/notes-v2/notes-workbench.tsx`
  - Render the minimal shell instead of `NotesLayout`, wire bottom controls to existing callbacks and panels.
- Modify: `english-shadowing-web/src/app/globals.css`
  - Add minimal canvas, bottom cluster, icon button, active pill, and popover styles scoped under `.desktop-app-frame .notes-v2--minimal`.
- Test/create as needed: `english-shadowing-web/tests/e2e/notes-vmark-minimal.spec.ts`
  - Optional if existing E2E fixture setup is usable quickly; otherwise verify manually with browser screenshot and run TypeScript/build checks.

## Task 1: Add Shared Popover Shell

**Files:**
- Verify existing: `english-shadowing-web/src/components/notes-v2/notes-workbench-popover.tsx`
  - This file already exists with identical logic. Confirm the props and behavior match; update only if the existing file diverges from the spec below.

- [ ] **Step 1: Verify (or update) the popover shell**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

type NotesWorkbenchPopoverProps = {
  anchor: "bottom-left" | "bottom-right";
  children: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "terminal";
};

export function NotesWorkbenchPopover({
  anchor,
  children,
  labelledBy,
  onClose,
  size = "md",
}: NotesWorkbenchPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby={labelledBy}
      className="notes-v2__corner-popover"
      data-anchor={anchor}
      data-size={size}
      ref={popoverRef}
      role="dialog"
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the new file**

Run: `npm run lint -- src/components/notes-v2/notes-workbench-popover.tsx`

Expected: ESLint either passes for this file or reports only pre-existing config limitations. If the command cannot target a single file in this setup, use `npm run lint` later in the final verification task.

## Task 2: Add Bottom-Left Document Controls

**Files:**
- Create: `english-shadowing-web/src/components/notes-v2/notes-workbench-bottom-left.tsx`

- [ ] **Step 1: Implement the bottom-left cluster**

```tsx
"use client";

import { useCallback, useState } from "react";
import { NotesFileTree } from "@/components/notes-v2/notes-file-tree";
import { NotesSearchPanel } from "@/components/notes-v2/notes-search-panel";
import { NotesWorkbenchPopover } from "@/components/notes-v2/notes-workbench-popover";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type { VaultEntry } from "@/features/notes/vault/vault-types";

type NotesWorkbenchBottomLeftProps = {
  activeDocument: NoteDocument | null;
  activePath: string | null;
  directoryInfo?: NotesDirectoryInfo;
  entries: VaultEntry[];
  onCreateNote?: () => void;
  onOpenPath: (path: string) => void;
  onPickDirectory?: () => void;
  onSearchQueryChange?: (value: string) => void;
  recentDocuments: NoteDocument[];
  searchQuery: string;
  searchResults: NoteDocument[];
};

function getDocumentTitle(document: NoteDocument | null) {
  return document?.parsed.title ?? document?.fileName ?? "Untitled-1";
}

export function NotesWorkbenchBottomLeft({
  activeDocument,
  activePath,
  directoryInfo,
  entries,
  onCreateNote,
  onOpenPath,
  onPickDirectory,
  onSearchQueryChange,
  recentDocuments,
  searchQuery,
  searchResults,
}: NotesWorkbenchBottomLeftProps) {
  const [openPopover, setOpenPopover] = useState<"workspace" | null>(null);
  const closePopover = useCallback(() => setOpenPopover(null), []);
  const toggleWorkspace = useCallback(() => setOpenPopover((p) => (p === "workspace" ? null : "workspace")), []);

  return (
    <div className="notes-v2__corner-cluster notes-v2__corner-cluster--left">
      <button
        aria-expanded={openPopover === "workspace"}
        aria-label={NOTES_UI_COPY.leftRail.files.open}
        className="notes-v2__corner-icon"
        onClick={toggleWorkspace}
        title={NOTES_UI_COPY.leftRail.files.open}
        type="button"
      >
        ▣
      </button>
      <button
        aria-label={NOTES_UI_COPY.headerActions.newNote}
        className="notes-v2__corner-icon"
        onClick={onCreateNote}
        title={NOTES_UI_COPY.headerActions.newNote}
        type="button"
      >
        +
      </button>
      <button
        aria-expanded={openPopover === "workspace"}
        aria-label={`Open workspace switcher for ${getDocumentTitle(activeDocument)}`}
        className="notes-v2__active-note-pill"
        onClick={toggleWorkspace}
        title={activeDocument?.path ?? directoryInfo?.vaultPath ?? undefined}
        type="button"
      >
        {getDocumentTitle(activeDocument)}
      </button>

      {openPopover === "workspace" && (
        <NotesWorkbenchPopover
          anchor="bottom-left"
          labelledBy="notes-v2-workspace-popover-title"
          onClose={closePopover}
          size="lg"
        >
          <div className="notes-v2__popover-header">
            <p id="notes-v2-workspace-popover-title">Workspace</p>
            {directoryInfo?.isConfigured === false && onPickDirectory ? (
              <button onClick={onPickDirectory} type="button">
                {NOTES_UI_COPY.leftPane.files.chooseFolder}
              </button>
            ) : null}
          </div>
          <div className="notes-v2__workspace-popover-grid">
            <div className="notes-v2__workspace-popover-files">
              <NotesFileTree
                activePath={activePath}
                entries={entries}
                onOpenPath={(path) => {
                  onOpenPath(path);
                  closePopover();
                }}
              />
            </div>
            <div className="notes-v2__workspace-popover-secondary">
              <NotesSearchPanel
                onOpenPath={(path) => {
                  onOpenPath(path);
                  closePopover();
                }}
                onQueryChange={onSearchQueryChange}
                query={searchQuery}
                results={searchResults}
              />
              <section className="notes-v2__recent-section">
                <div className="notes-v2__section-heading">
                  <h3>{NOTES_UI_COPY.leftPane.files.recent}</h3>
                  <span>{recentDocuments.length}</span>
                </div>
                <ul className="notes-v2__panel-list">
                  {recentDocuments.map((document) => (
                    <li key={document.path}>
                      <button
                        aria-label={`Open recent note ${getDocumentTitle(document)}`}
                        onClick={() => {
                          onOpenPath(document.path);
                          closePopover();
                        }}
                        type="button"
                      >
                        <strong>{getDocumentTitle(document)}</strong>
                        <span>{document.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </NotesWorkbenchPopover>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Check imports and copy keys**

Run: `npm run lint -- src/components/notes-v2/notes-workbench-bottom-left.tsx`

Expected: No missing import or undefined copy key errors.

## Task 3: Add Bottom-Right Status and Tool Controls

**Files:**
- Create: `english-shadowing-web/src/components/notes-v2/notes-workbench-bottom-right.tsx`

- [ ] **Step 1: Implement word/character metrics and right controls**

Use existing panels as popover content. Keep the first implementation simple: one active right popover at a time.

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { NotesBacklinksPanel } from "@/components/notes-v2/notes-backlinks-panel";
import { NotesLearningPanel } from "@/components/notes-v2/notes-learning-panel";
import { NotesOutlinePanel } from "@/components/notes-v2/notes-outline-panel";
import { NotesPropertiesPanel } from "@/components/notes-v2/notes-properties-panel";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";
import { NotesWorkbenchPopover } from "@/components/notes-v2/notes-workbench-popover";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";
import type {
  NotesEditorMode,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type {
  DesktopCommandRecord,
  DesktopTerminalBridge,
} from "@/platform/desktop/desktop-bridge";

type RightPopover =
  | "outline"
  | "backlinks"
  | "properties"
  | "learning"
  | "terminal"
  | "overflow";

type NotesWorkbenchBottomRightProps = {
  activeDocument: NoteDocument | null;
  backlinks: NoteDocument[];
  desktopCommands: DesktopCommandRecord[];
  desktopTerminal: DesktopTerminalBridge | null;
  directoryInfo?: NotesDirectoryInfo;
  editorActiveLine: number;
  editorMode: NotesEditorMode;
  isDesktopBridgeAvailable: boolean;
  lastRunCommandTitle: string | null;
  learningQuery: string;
  learningSnippets: LearningSnippet[];
  noteOpenStrategy?: NoteOpenStrategy | null;
  onDeleteActiveNote?: () => void;
  onEditorModeChange?: (mode: NotesEditorMode) => void;
  onInsertSnippet?: (snippet: string) => void;
  onJumpToHeading: (line: number) => void;
  onLearningQueryChange?: (value: string) => void;
  onOpenPath: (path: string) => void;
  onRefresh?: () => void;
  onRefreshDesktopCommands?: () => void;
  onRenameActiveNote?: () => void;
  onRebuildIndex?: () => void;
  onRunDesktopCommand?: (commandId: string) => void;
  onExportActiveDocumentHtml?: () => void;
  onExportActiveDocumentPdf?: () => void;
  onExportVault?: () => void;
  selectionState?: NotesEditorSelectionState | null;
};

export function NotesWorkbenchBottomRight(props: NotesWorkbenchBottomRightProps) {
  const {
    activeDocument,
    backlinks,
    desktopCommands,
    desktopTerminal,
    directoryInfo,
    editorActiveLine,
    editorMode,
    isDesktopBridgeAvailable,
    lastRunCommandTitle,
    learningQuery,
    learningSnippets,
    noteOpenStrategy = null,
    onDeleteActiveNote,
    onEditorModeChange,
    onInsertSnippet,
    onJumpToHeading,
    onLearningQueryChange,
    onOpenPath,
    onRefresh,
    onRefreshDesktopCommands,
    onRenameActiveNote,
    onRebuildIndex,
    onRunDesktopCommand,
    onExportActiveDocumentHtml,
    onExportActiveDocumentPdf,
    onExportVault,
    selectionState = null,
  } = props;
  const [openPopover, setOpenPopover] = useState<RightPopover | null>(null);
  const wordCount = activeDocument?.parsed.wordCount ?? 0;
  const charCount = useMemo(
    () => (activeDocument?.rawSource ?? "").replace(/\s/g, "").length,
    [activeDocument?.rawSource],
  );
  const closePopover = useCallback(() => setOpenPopover(null), []);
  const togglePopover = useCallback((popover: RightPopover) => {
    setOpenPopover((current) => (current === popover ? null : popover));
  }, []);

  return (
    <div className="notes-v2__corner-cluster notes-v2__corner-cluster--right">
      <span className="notes-v2__corner-stat">{wordCount} 词</span>
      <span className="notes-v2__corner-stat">{charCount} 字符</span>
      <span aria-label="Saved" className="notes-v2__sync-mark" title="Saved">
        ⇣
      </span>
      <span aria-hidden="true" className="notes-v2__dirty-dot" />

      <button className="notes-v2__corner-icon" onClick={() => togglePopover("learning")} title={NOTES_UI_COPY.rightRail.learning.open} type="button">
        ⌘
      </button>
      <button className="notes-v2__corner-icon" onClick={() => togglePopover("backlinks")} title={NOTES_UI_COPY.rightRail.backlinks.open} type="button">
        ↶
      </button>
      <button className="notes-v2__corner-icon" onClick={() => togglePopover("terminal")} title={NOTES_UI_COPY.rightRail.terminal.open} type="button">
        ›_
      </button>
      <button
        aria-label={editorMode === "source" ? NOTES_UI_COPY.toolbar.richText : NOTES_UI_COPY.toolbar.source}
        className="notes-v2__corner-icon"
        onClick={() => onEditorModeChange?.(editorMode === "source" ? "wysiwyg" : "source")}
        title={editorMode === "source" ? NOTES_UI_COPY.toolbar.richText : NOTES_UI_COPY.toolbar.source}
        type="button"
      >
        T
      </button>
      <button className="notes-v2__corner-icon" onClick={() => togglePopover("properties")} title={NOTES_UI_COPY.rightRail.properties.open} type="button">
        □
      </button>
      <button className="notes-v2__corner-icon" onClick={() => togglePopover("overflow")} title="More actions" type="button">
        …
      </button>

      {openPopover === "learning" && (
        <NotesWorkbenchPopover anchor="bottom-right" onClose={closePopover} size="md">
          <NotesLearningPanel onInsertSnippet={onInsertSnippet} onQueryChange={onLearningQueryChange} query={learningQuery} snippets={learningSnippets} />
        </NotesWorkbenchPopover>
      )}
      {openPopover === "backlinks" && (
        <NotesWorkbenchPopover anchor="bottom-right" onClose={closePopover} size="md">
          <NotesBacklinksPanel backlinks={backlinks} onOpenPath={onOpenPath} />
        </NotesWorkbenchPopover>
      )}
      {openPopover === "properties" && (
        <NotesWorkbenchPopover anchor="bottom-right" onClose={closePopover} size="md">
          <NotesOutlinePanel activeLine={editorActiveLine} document={activeDocument} onJumpToHeading={onJumpToHeading} />
          <NotesPropertiesPanel document={activeDocument} editorMode={editorMode} openStrategy={noteOpenStrategy} selection={selectionState} />
        </NotesWorkbenchPopover>
      )}
      {openPopover === "terminal" && (
        <NotesWorkbenchPopover anchor="bottom-right" onClose={closePopover} size="terminal">
          <NotesTerminalPanel
            commands={desktopCommands}
            isDesktopBridgeAvailable={isDesktopBridgeAvailable}
            lastRunCommandTitle={lastRunCommandTitle}
            onRefreshCommands={onRefreshDesktopCommands}
            onRunCommand={onRunDesktopCommand}
            terminalBridge={desktopTerminal}
            terminalCwd={directoryInfo?.vaultPath ?? null}
          />
        </NotesWorkbenchPopover>
      )}
      {openPopover === "overflow" && (
        <NotesWorkbenchPopover anchor="bottom-right" onClose={closePopover} size="sm">
          <div className="notes-v2__overflow-menu">
            <button onClick={onRenameActiveNote} type="button">{NOTES_UI_COPY.headerActions.rename}</button>
            <button onClick={onRefresh} type="button">{NOTES_UI_COPY.headerActions.refresh}</button>
            <button onClick={onRebuildIndex} type="button">{NOTES_UI_COPY.headerActions.rebuildIndex}</button>
            <button onClick={onExportVault} type="button">{NOTES_UI_COPY.headerActions.exportVault}</button>
            <button disabled={!activeDocument} onClick={onExportActiveDocumentHtml} type="button">{NOTES_UI_COPY.headerActions.exportHtml}</button>
            <button disabled={!activeDocument} onClick={onExportActiveDocumentPdf} type="button">{NOTES_UI_COPY.headerActions.exportPdf}</button>
            <button className="notes-v2__overflow-danger" disabled={!activeDocument} onClick={onDeleteActiveNote} type="button">{NOTES_UI_COPY.headerActions.delete}</button>
          </div>
        </NotesWorkbenchPopover>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tighten accessibility before moving on**

Add `aria-label` to every icon-only button if lint or manual review flags omissions. Keep destructive actions text-labeled in overflow.

## Task 4: Hide the Old Center Toolbar in Minimal Mode

**Files:**
- Modify: `english-shadowing-web/src/components/notes-v2/notes-workbench-center.tsx`

- [ ] **Step 1: Add optional prop**

Add to `NotesWorkbenchCenterProps`:

```ts
  minimalChrome?: boolean;
```

- [ ] **Step 2: Conditionally render old document toolbar**

Replace the unconditional toolbar block:

```tsx
      <div className="notes-v2__document-toolbar">
        <NotesTabs ... />
        {rightToolbarActions}
      </div>
```

with:

```tsx
      {!minimalChrome ? (
        <div className="notes-v2__document-toolbar">
          <NotesTabs
            activePath={activePath}
            documents={openDocuments}
            onClosePath={onClosePath}
            onOpenPath={onOpenPath}
          />
          {rightToolbarActions}
        </div>
      ) : null}
```

- [ ] **Step 3: Keep existing behavior as default**

Ensure the default prop is falsy so non-minimal callers keep the old toolbar unless explicitly opted into minimal mode.

## Task 5: Wire Minimal Chrome in NotesWorkbench

**Files:**
- Modify: `english-shadowing-web/src/components/notes-v2/notes-workbench.tsx`

- [ ] **Step 1: Replace layout imports**

Remove imports no longer needed in the minimal render path:

```ts
import { NotesWorkbenchHeader } from "...";
import { NotesWorkbenchLeftSidebar } from "...";
import { NotesWorkbenchRightSidebar } from "...";
import { NotesLayout } from "...";
```

Add:

```ts
import { NotesWorkbenchBottomLeft } from "@/components/notes-v2/notes-workbench-bottom-left";
import { NotesWorkbenchBottomRight } from "@/components/notes-v2/notes-workbench-bottom-right";
```

Keep `notes-layout-resize` only if still used; otherwise remove related width state/effects.

- [ ] **Step 2: Render minimal shell**

Replace the `<NotesLayout ... />` call with:

```tsx
      <section className="notes-v2 notes-v2--minimal">
        <main className="notes-v2__minimal-canvas">
          <NotesWorkbenchCenter
            activeDocument={activeDocument}
            activePath={activePath}
            editorMode={editorMode}
            documents={documents}
            errorMessage={errorMessage}
            isLoading={isLoading}
            minimalChrome
            onClosePath={onClosePath}
            onDocumentChange={onDocumentChange}
            onEditorActiveLineChange={onEditorActiveLineChange}
            onEditorBridgeReady={handleBridgeReady}
            onEditorSelectionStateChange={setSelectionState}
            onOpenPath={onOpenPath}
            openDocuments={openDocuments}
            rightToolbarActions={rightToolbarActions}
          />
        </main>

        <NotesWorkbenchBottomLeft
          activeDocument={activeDocument}
          activePath={activePath}
          directoryInfo={directoryInfo}
          entries={entries}
          onCreateNote={onCreateNote}
          onOpenPath={onOpenPath}
          onPickDirectory={onPickDirectory}
          onSearchQueryChange={onSearchQueryChange}
          recentDocuments={recentDocuments}
          searchQuery={searchQuery}
          searchResults={searchResults}
        />

        <NotesWorkbenchBottomRight
          activeDocument={activeDocument}
          backlinks={backlinks}
          desktopCommands={desktopCommands}
          desktopTerminal={desktopTerminal}
          directoryInfo={directoryInfo}
          editorActiveLine={editorActiveLine}
          editorMode={editorMode}
          isDesktopBridgeAvailable={isDesktopBridgeAvailable}
          lastRunCommandTitle={lastRunCommandTitle}
          learningQuery={learningQuery}
          learningSnippets={learningSnippets}
          noteOpenStrategy={activeOpenStrategy}
          onDeleteActiveNote={onDeleteActiveNote}
          onEditorModeChange={onEditorModeChange}
          onExportActiveDocumentHtml={onExportActiveDocumentHtml}
          onExportActiveDocumentPdf={onExportActiveDocumentPdf}
          onExportVault={onExportVault}
          onInsertSnippet={onInsertSnippet}
          onJumpToHeading={handleJumpToHeading}
          onLearningQueryChange={onLearningQueryChange}
          onOpenPath={onOpenPath}
          onRefresh={onRefresh}
          onRefreshDesktopCommands={onRefreshDesktopCommands}
          onRebuildIndex={onRebuildIndex}
          onRenameActiveNote={onRenameActiveNote}
          onRunDesktopCommand={onRunDesktopCommand}
          selectionState={selectionState}
        />
      </section>
```

- [ ] **Step 3: Remove dead old layout variables**

Remove `rightSidebarWidth`, the width-adjusting `useEffect`, `handleRightRailModeSelect`, `leftRail`, and any old persistent sidebar render variables if no longer used.

- [ ] **Step 4: Preserve command palette and write conflict dialog**

Keep `NotesCommandPalette`, `NotesWriteConflictDialog`, and the `data-testid="notes-workbench"` marker after the minimal section exactly as before.

## Task 6: Add Minimal Canvas CSS

**Files:**
- Modify: `english-shadowing-web/src/app/globals.css`

- [ ] **Step 1: Add scoped minimal styles near existing notes-v2 CSS**

Append after the current `.desktop-app-frame .notes-v2...` block:

```css
.desktop-app-frame .notes-v2--minimal {
  position: relative;
  display: block;
  min-height: 100%;
  overflow: hidden;
  background: #ececeb;
  color: #242424;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__minimal-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__center-stack {
  height: 100%;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__editor-pane,
.desktop-app-frame .notes-v2--minimal .notes-v2__reading-pane {
  border: 0;
  box-shadow: none;
  background: transparent;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__editor-heading {
  max-width: 760px;
  margin: 0 auto;
  padding-top: 72px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__editor-host,
.desktop-app-frame .notes-v2--minimal .notes-v2__rich-editor-surface {
  max-width: 760px;
  margin: 0 auto;
  background: transparent;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-cluster {
  position: absolute;
  z-index: 30;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 15px;
  color: #82817e;
  font-size: 14px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-cluster--left {
  left: 23px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-cluster--right {
  right: 23px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-icon,
.desktop-app-frame .notes-v2--minimal .notes-v2__active-note-pill {
  border: 0;
  background: transparent;
  color: inherit;
  min-width: 26px;
  height: 28px;
  border-radius: 999px;
  padding: 0 8px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-icon:hover,
.desktop-app-frame .notes-v2--minimal .notes-v2__corner-icon:focus-visible,
.desktop-app-frame .notes-v2--minimal .notes-v2__active-note-pill:hover,
.desktop-app-frame .notes-v2--minimal .notes-v2__active-note-pill:focus-visible {
  background: rgba(255, 255, 255, 0.46);
  color: #2f2f2f;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__active-note-pill {
  max-width: min(260px, 32vw);
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.38);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.035);
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-stat {
  white-space: nowrap;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__sync-mark {
  color: #337dff;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #337dff;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover {
  position: absolute;
  z-index: 40;
  bottom: 56px;
  max-height: min(70vh, 620px);
  overflow: auto;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(18px);
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-anchor="bottom-left"] {
  left: 18px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-anchor="bottom-right"] {
  right: 18px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-size="sm"] {
  width: 260px;
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-size="md"] {
  width: min(380px, calc(100vw - 48px));
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-size="lg"] {
  width: min(720px, calc(100vw - 48px));
}

.desktop-app-frame .notes-v2--minimal .notes-v2__corner-popover[data-size="terminal"] {
  width: min(760px, calc(100vw - 48px));
}
```

- [ ] **Step 2: Add content-specific popover styles**

Add compact rules for:

- `.notes-v2__popover-header`
- `.notes-v2__workspace-popover-grid`
- `.notes-v2__workspace-popover-files`
- `.notes-v2__workspace-popover-secondary`
- `.notes-v2__overflow-menu`
- `.notes-v2__overflow-danger`

Keep them low-border and VMark-like: soft backgrounds, no heavy separators.

## Task 7: Update Tests and E2E Selectors

**Files:**
- Modify as needed:
  - `english-shadowing-web/tests/e2e/notes-localization.spec.ts`
  - `english-shadowing-web/tests/e2e/notes-obsidian-workbench.spec.ts`
  - `english-shadowing-web/tests/e2e/notes-editor-focus.spec.ts`
  - `english-shadowing-web/tests/e2e/notes-adjacent-formatting.spec.ts`
- Optional create:
  - `english-shadowing-web/tests/e2e/notes-vmark-minimal.spec.ts`

- [ ] **Step 1: Search broken old UI assumptions**

Run:

```bash
rg -n "notes-v2__document-toolbar|notes-v2__header|notes-v2__sidebar|notes-v2__rail|notes-v2__document-path|notes-v2__editor-heading" tests/e2e tests/component
```

- [ ] **Step 2: Prefer stable selectors over old layout selectors**

If tests expect the old sidebars to be visible by default, update them to open the relevant bottom popover first.

- [ ] **Step 3: Add a minimal smoke E2E if practical**

Test intent:

```ts
test("notes-v2 renders VMark-like minimal chrome", async ({ page }) => {
  await page.goto("/notes");
  await expect(page.locator(".notes-v2--minimal")).toBeVisible();
  await expect(page.locator(".notes-v2__corner-cluster--left")).toBeVisible();
  await expect(page.locator(".notes-v2__corner-cluster--right")).toBeVisible();
  await expect(page.locator(".notes-v2__header")).toHaveCount(0);
});
```

Adjust setup to match existing notes E2E helpers.

## Task 8: Verification

**Files:**
- No code changes unless verification reveals bugs.

- [ ] **Step 1: Run focused TypeScript/lint check**

Run from `english-shadowing-web`:

```bash
npm run lint
```

Expected: No new lint errors from changed notes-v2 files. If unrelated pre-existing failures appear, capture exact files.

- [ ] **Step 2: Run focused component tests**

Run:

```bash
npm run test -- tests/component/notes
```

Expected: Notes component tests pass, or failures are unrelated to the minimal shell.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Build succeeds, or any failures are documented as pre-existing and unrelated.

- [ ] **Step 4: Start local app for browser verification**

Run:

```bash
npm run dev
```

Open `/notes` in the in-app browser.

- [ ] **Step 5: Visual probes**

Verify:

- Default notes screen has `.notes-v2--minimal`.
- No persistent `.notes-v2__header`, left sidebar, right sidebar, or rail is visible.
- Bottom-left controls are visible and small.
- Bottom-right controls are visible and small.
- Workspace popover opens and closes.
- Learning/backlinks/properties/terminal popovers open one at a time.
- `Esc` closes an open popover.
- `Cmd+K` still opens the command palette.
- `Cmd+F` still opens find.

- [ ] **Step 6: Commit implementation**

```bash
git add \
  src/components/notes-v2/notes-workbench.tsx \
  src/components/notes-v2/notes-workbench-center.tsx \
  src/components/notes-v2/notes-workbench-popover.tsx \
  src/components/notes-v2/notes-workbench-bottom-left.tsx \
  src/components/notes-v2/notes-workbench-bottom-right.tsx \
  src/app/globals.css \
  tests/e2e/notes-vmark-minimal.spec.ts
git commit -m "feat: redesign notes v2 as minimal canvas"
```

Only include the test file if it was created.
