"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type MouseEvent,
} from "react";
import { ClockCounterClockwise, Plus, ArrowClockwise, Trash, X } from "@phosphor-icons/react";
import { terminalTabGlyph } from "./terminal/notes-terminal-options";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useNotesTerminalSessions } from "@/components/notes-v2/terminal/use-notes-terminal-sessions";
import { NotesTerminalTranscript } from "./terminal/notes-terminal-transcript";
import type {
  DesktopCommandRecord,
  DesktopTerminalBridge,
} from "@/platform/desktop/desktop-bridge";

type TerminalContextMenuState = {
  x: number;
  y: number;
};

type NotesTerminalPanelProps = {
  autoFocus?: boolean;
  visible?: boolean;
  commands: DesktopCommandRecord[];
  compactChrome?: boolean;
  isDesktopBridgeAvailable: boolean;
  lastRunCommandTitle?: string | null;
  onRefreshCommands?: () => void;
  onRunCommand?: (commandId: string) => void;
  terminalBridge?: DesktopTerminalBridge | null;
  terminalCwd?: string | null;
  workspaceInstanceId?: string | null;
  onClosePanel?: () => void;
};

export function NotesTerminalPanel({
  autoFocus = true,
  visible = true,
  commands,
  compactChrome = false,
  isDesktopBridgeAvailable,
  lastRunCommandTitle = null,
  onRefreshCommands,
  onRunCommand,
  terminalBridge = null,
  terminalCwd = null,
  workspaceInstanceId = null,
  onClosePanel,
}: NotesTerminalPanelProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  const {
    activeSession,
    activeSessionId,
    clearActiveSession,
    closeActiveSession,
    copyActiveSelection,
    createSession,
    focusActiveSession,
    hostRef,
    isMaxed,
    pasteIntoActiveSession,
    restartActiveSession,
    searchQuery,
    selectAllActiveSession,
    sessions,
    setActiveSessionId,
    setSearchQuery,
    statusMessage,
  } = useNotesTerminalSessions({
    cwd: terminalCwd,
    enabled: Boolean(terminalBridge),
    terminalBridge,
    visible,
    workspaceInstanceId,
    onSearch: toggleSearch,
  });
  const closeSession = useCallback(() => {
    closeActiveSession();
    if (sessions.length === 1) onClosePanel?.();
  }, [closeActiveSession, onClosePanel, sessions.length]);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
    else setSearchQuery("");
  }, [searchOpen, setSearchQuery]);

  useEffect(() => {
    if (!autoFocus || !visible) return;
    const timer = requestAnimationFrame(() => {
      focusActiveSession();
    });
    return () => cancelAnimationFrame(timer);
  }, [autoFocus, focusActiveSession, visible]);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptRegionId = useId();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcriptToggle = terminalBridge?.readTranscript && terminalBridge.configureTranscript && terminalBridge.transcriptStatus ? (
    <button type="button" aria-controls={transcriptRegionId} aria-expanded={transcriptOpen}
      className={compactChrome ? "notes-v2__terminal-dock-button" : undefined}
      aria-label={transcriptOpen ? "隐藏 Agent 执行记录" : "显示 Agent 执行记录"}
      title={transcriptOpen ? "隐藏 Agent 执行记录" : "显示 Agent 执行记录"}
      onClick={() => setTranscriptOpen((open) => !open)}>
      {compactChrome ? <ClockCounterClockwise aria-hidden="true" size={14} /> : "执行记录"}
    </button>
  ) : null;
  const [contextMenu, setContextMenu] =
    useState<TerminalContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleTerminalContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      focusActiveSession();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [focusActiveSession],
  );

  const runContextMenuAction = useCallback(
    (action: () => void | Promise<void>) => {
      closeContextMenu();
      void action();
    },
    [closeContextMenu],
  );

  const sessionDock = compactChrome ? (
    <div className="notes-v2__terminal-session-dock">
      <div
        aria-label={NOTES_UI_COPY.panels.terminal.sessionsLabel}
        className="notes-v2__terminal-session-tabs"
        role="tablist"
      >
        {sessions.map((session) => (
          <button
            aria-label={session.programTitle || session.label}
            aria-selected={session.id === activeSessionId}
            className="notes-v2__terminal-tab"
            data-active={session.id === activeSessionId ? "true" : "false"}
            data-status={session.status}
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            role="tab"
            title={`${session.programTitle || session.label} ${session.shell ?? ""}`.trim()}
            type="button"
          >
            {terminalTabGlyph(session.label, session.programTitle)}
          </button>
        ))}
        <button
          aria-label={NOTES_UI_COPY.panels.terminal.newSession}
          className="notes-v2__terminal-dock-button"
          disabled={isMaxed}
          onClick={() => createSession()}
          title={NOTES_UI_COPY.panels.terminal.newSession}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="notes-v2__terminal-session-actions">
        {transcriptToggle}
        <button
          aria-label={NOTES_UI_COPY.panels.terminal.restartSession}
          className="notes-v2__terminal-dock-button"
          onClick={() => restartActiveSession()}
          title={NOTES_UI_COPY.panels.terminal.restartSession}
          type="button"
        >
          <ArrowClockwise aria-hidden="true" size={14} />
        </button>
        <button
          aria-label={NOTES_UI_COPY.panels.terminal.closeSession}
          className="notes-v2__terminal-dock-button"
          onClick={closeSession}
          title={NOTES_UI_COPY.panels.terminal.closeSession}
          type="button"
        >
          <Trash aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeContextMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenu, contextMenu]);

  if (terminalBridge) {
    return (
      <section className="notes-v2__terminal-mode" data-visible={visible ? "true" : "false"}>
        <div className="notes-v2__terminal-shell">
          {activeSession?.backend === "pipe" ? (
            <p className="notes-v2__terminal-degraded" role="status">
              简化终端 · 未连接到 TTY，交互式 CLI 和窗口尺寸同步不可用。
            </p>
          ) : null}
          {compactChrome ? null : (
            <div className="notes-v2__terminal-toolbar">
            <div
              aria-label={NOTES_UI_COPY.panels.terminal.sessionsLabel}
              className="notes-v2__terminal-tabs"
              role="tablist"
            >
              {sessions.map((session) => (
                <button
                  aria-selected={session.id === activeSessionId}
                  className="notes-v2__terminal-tab"
                  data-active={
                    session.id === activeSessionId ? "true" : "false"
                  }
                  data-status={session.status}
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  role="tab"
                  title={`${session.programTitle || session.label} ${session.shell ?? ""}`.trim()}
                  type="button"
                >
                  {terminalTabGlyph(session.label, session.programTitle)}
                </button>
              ))}
              <button
                disabled={isMaxed}
                onClick={() => createSession()}
                type="button"
              >
                {NOTES_UI_COPY.panels.terminal.newSession}
              </button>
            </div>

            <div className="notes-v2__terminal-actions">
              {transcriptToggle}
              <button onClick={() => restartActiveSession()} type="button">
                {NOTES_UI_COPY.panels.terminal.restartSession}
              </button>
              <button onClick={() => clearActiveSession()} type="button">
                {NOTES_UI_COPY.panels.terminal.clearSession}
              </button>
              <button onClick={() => copyActiveSelection()} type="button">
                {NOTES_UI_COPY.panels.terminal.copySelection}
              </button>
              <button onClick={closeSession} type="button">
                {NOTES_UI_COPY.panels.terminal.closeSession}
              </button>
            </div>
            </div>
          )}

          {!compactChrome || searchOpen ? (
            <label className="notes-v2__terminal-search">
              <span className="notes-v2__sr-only">
                {NOTES_UI_COPY.panels.terminal.searchSrOnly}
              </span>
              <input
                ref={searchInputRef}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchOpen(false);
                    setSearchQuery("");
                    focusActiveSession();
                  }
                }}
                placeholder={NOTES_UI_COPY.panels.terminal.searchPlaceholder}
                value={searchQuery}
              />
              {compactChrome ? <button type="button" aria-label="关闭终端查找" onClick={() => { setSearchOpen(false); setSearchQuery(""); focusActiveSession(); }}><X size={14} aria-hidden="true" /></button> : null}
            </label>
          ) : null}

          <div
            className="notes-v2__terminal-surface"
            data-transcript-open={transcriptOpen ? "true" : "false"}
            onContextMenu={handleTerminalContextMenu}
            onMouseDown={() => focusActiveSession()}
          >
            <div
              className="notes-v2__terminal-host"
              data-testid="notes-terminal-host"
              ref={hostRef}
            />
            {visible && transcriptOpen ? <NotesTerminalTranscript bridge={terminalBridge} sessionId={activeSessionId} id={transcriptRegionId} /> : null}
          </div>
          {contextMenu ? (
            <div
              aria-label={NOTES_UI_COPY.panels.terminal.contextMenu.label}
              className="notes-v2__terminal-context-menu"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              ref={contextMenuRef}
              role="menu"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
            >
              <button
                onClick={() => runContextMenuAction(copyActiveSelection)}
                role="menuitem"
                type="button"
              >
                {NOTES_UI_COPY.panels.terminal.contextMenu.copy}
              </button>
              <button
                onClick={() => runContextMenuAction(pasteIntoActiveSession)}
                role="menuitem"
                type="button"
              >
                {NOTES_UI_COPY.panels.terminal.contextMenu.paste}
              </button>
              <button
                onClick={() => runContextMenuAction(selectAllActiveSession)}
                role="menuitem"
                type="button"
              >
                {NOTES_UI_COPY.panels.terminal.contextMenu.selectAll}
              </button>
              <div
                className="notes-v2__terminal-context-menu-separator"
                role="separator"
              />
              <button
                onClick={() => runContextMenuAction(clearActiveSession)}
                role="menuitem"
                type="button"
              >
                {NOTES_UI_COPY.panels.terminal.contextMenu.clear}
              </button>
            </div>
          ) : null}
          {sessionDock}
        </div>

        {statusMessage ? (
          <p className="notes-v2__terminal-status" role="alert">{statusMessage}</p>
        ) : null}

        {compactChrome ? null : (
          <div
            className="notes-v2__terminal-meta"
            title={activeSession?.cwd ?? terminalCwd ?? undefined}
          >
            <code>{activeSession?.shell ?? "terminal://desktop-bridge"}</code>
            <span>{activeSession?.cwd ?? terminalCwd}</span>
            <span>
              {activeSession?.backend
                ? NOTES_UI_COPY.panels.terminal.backends[activeSession.backend]
                : NOTES_UI_COPY.panels.terminal.starting}
            </span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="notes-v2__terminal-mode notes-v2__terminal-mode--preview">
      <div className="notes-v2__terminal-surface notes-v2__terminal-surface--preview">
        <div className="notes-v2__terminal-preview">
          <code>
            {isDesktopBridgeAvailable
              ? "terminal://desktop-bridge"
              : "terminal://unavailable"}
          </code>
          <p>
            {isDesktopBridgeAvailable
              ? NOTES_UI_COPY.panels.terminal.availableDescription
              : NOTES_UI_COPY.panels.terminal.unavailableDescription}
          </p>
        </div>
      </div>

      <div className="notes-v2__terminal-actions">
        <button onClick={() => onRefreshCommands?.()} type="button">
          {NOTES_UI_COPY.panels.terminal.refreshCommands}
        </button>
      </div>

      {lastRunCommandTitle ? (
        <p className="notes-v2__terminal-status">
          {`${NOTES_UI_COPY.panels.terminal.lastCommandPrefix}${lastRunCommandTitle}`}
        </p>
      ) : null}

      {commands.length > 0 ? (
        <ul className="notes-v2__panel-list">
          {commands.map((command) => (
            <li key={command.id}>
              <button onClick={() => onRunCommand?.(command.id)} type="button">
                <strong>{command.title}</strong>
                <span>{command.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-v2__empty-copy">
          {NOTES_UI_COPY.panels.terminal.empty}
        </p>
      )}
    </section>
  );
}
