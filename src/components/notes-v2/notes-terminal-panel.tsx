"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type MouseEvent,
} from "react";
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
  commands: DesktopCommandRecord[];
  compactChrome?: boolean;
  isDesktopBridgeAvailable: boolean;
  lastRunCommandTitle?: string | null;
  onRefreshCommands?: () => void;
  onRunCommand?: (commandId: string) => void;
  terminalBridge?: DesktopTerminalBridge | null;
  terminalCwd?: string | null;
  workspaceInstanceId?: string | null;
};

function getSessionButtonLabel(label: string) {
  return label.match(/^Terminal (\d+)$/)?.[1] ?? label.slice(0, 1).toUpperCase();
}

export function NotesTerminalPanel({
  autoFocus = true,
  commands,
  compactChrome = false,
  isDesktopBridgeAvailable,
  lastRunCommandTitle = null,
  onRefreshCommands,
  onRunCommand,
  terminalBridge = null,
  terminalCwd = null,
  workspaceInstanceId = null,
}: NotesTerminalPanelProps) {
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
    workspaceInstanceId,
  });

  useEffect(() => {
    if (!autoFocus) return;
    const timer = requestAnimationFrame(() => {
      focusActiveSession();
    });
    return () => cancelAnimationFrame(timer);
  }, [autoFocus, focusActiveSession]);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptRegionId = useId();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcriptToggle = terminalBridge?.readTranscript && terminalBridge.configureTranscript && terminalBridge.transcriptStatus ? (
    <button type="button" aria-controls={transcriptRegionId} aria-expanded={transcriptOpen}
      aria-label="显示 Agent 执行记录" onClick={() => setTranscriptOpen((open) => !open)}>
      执行记录
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
            aria-label={session.label}
            aria-selected={session.id === activeSessionId}
            className="notes-v2__terminal-tab"
            data-active={session.id === activeSessionId ? "true" : "false"}
            data-status={session.status}
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            role="tab"
            title={`${session.label} ${session.shell ?? ""}`.trim()}
            type="button"
          >
            {getSessionButtonLabel(session.label)}
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
          <span aria-hidden="true">+</span>
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
          <span aria-hidden="true">↻</span>
        </button>
        <button
          aria-label={NOTES_UI_COPY.panels.terminal.closeSession}
          className="notes-v2__terminal-dock-button"
          onClick={() => closeActiveSession()}
          title={NOTES_UI_COPY.panels.terminal.closeSession}
          type="button"
        >
          <span aria-hidden="true">×</span>
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
      <section className="notes-v2__terminal-mode">
        <div className="notes-v2__terminal-shell">
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
                  title={`${session.label} ${session.shell ?? ""}`.trim()}
                  type="button"
                >
                  {getSessionButtonLabel(session.label)}
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
              <button onClick={() => closeActiveSession()} type="button">
                {NOTES_UI_COPY.panels.terminal.closeSession}
              </button>
            </div>
            </div>
          )}

          {compactChrome ? null : (
            <label className="notes-v2__terminal-search">
              <span className="notes-v2__sr-only">
                {NOTES_UI_COPY.panels.terminal.searchSrOnly}
              </span>
              <input
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={NOTES_UI_COPY.panels.terminal.searchPlaceholder}
                value={searchQuery}
              />
            </label>
          )}

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
            {transcriptOpen ? <NotesTerminalTranscript bridge={terminalBridge} sessionId={activeSessionId} id={transcriptRegionId} /> : null}
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
          <p className="notes-v2__terminal-status">{statusMessage}</p>
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
