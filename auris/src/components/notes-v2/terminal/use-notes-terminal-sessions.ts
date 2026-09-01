"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import type {
  DesktopTerminalBridge,
  DesktopTerminalSessionRecord,
} from "@/platform/desktop/desktop-bridge";
import {
  selectActiveTerminalSessionId,
  selectTerminalSessionsForWorkspace,
} from "@/features/notes/workspace/terminal-session-scope";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_SESSIONS = 5;
const WINDOW_TERMINAL_SCOPE = "__window__";
const lastActiveSessionByScope = new Map<string, string>();

type SessionStatus = "starting" | "running" | "exited" | "failed";

export type NotesTerminalSession = {
  backend: DesktopTerminalSessionRecord["backend"] | null;
  cwd: string | null;
  id: string;
  isAlive: boolean;
  label: string;
  shell: string | null;
  status: SessionStatus;
  workspaceInstanceId: string | null;
};

type TerminalEntry = {
  container: HTMLDivElement;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  terminal: Terminal;
};

type UseNotesTerminalSessionsInput = {
  cwd?: string | null;
  enabled: boolean;
  terminalBridge?: DesktopTerminalBridge | null;
  workspaceInstanceId?: string | null;
};

function getThemeScope(element?: Element | null) {
  if (typeof window === "undefined") {
    return null;
  }

  return element?.closest(".notes-v2") ?? document.documentElement;
}

function readThemeToken(
  variableName: string,
  fallback: string,
  scopeElement?: Element | null,
) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const scope = getThemeScope(scopeElement);
  const scopeValue = scope
    ? getComputedStyle(scope).getPropertyValue(variableName).trim()
    : "";

  if (scopeValue) {
    return scopeValue;
  }

  const rootValue = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  return rootValue || fallback;
}

// xterm.js renders into a canvas, and a canvas with "transparent" (or any
// non-opaque) background paints as solid black because there is nothing
// underneath the canvas to composite with. The notes UI legitimately sets
// --notes-pane to "transparent" in minimal mode so the surrounding CSS lets
// the page show through. That value, however, makes the terminal unreadable.
// readOpaqueThemeColor wraps readThemeToken and discards any value that is
// empty, "transparent", or a fully-transparent rgba(...) so the caller can
// keep walking down the fallback chain to a solid color.
function isOpaqueColor(value: string) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent" || normalized === "none") {
    return false;
  }

  // rgba(...) / hsla(...) with explicit zero alpha.
  const alphaMatch = normalized.match(/^(?:rgba|hsla)\([^)]*?,\s*([0-9.]+)\s*\)$/);
  if (alphaMatch && Number.parseFloat(alphaMatch[1] ?? "1") === 0) {
    return false;
  }

  // 8-digit hex with zero alpha (#rrggbb00 / #rgb0).
  if (/^#[0-9a-f]{6}00$/i.test(normalized) || /^#[0-9a-f]{3}0$/i.test(normalized)) {
    return false;
  }

  return true;
}

function readOpaqueThemeColor(
  variableNames: readonly string[],
  fallback: string,
  scopeElement?: Element | null,
) {
  for (const name of variableNames) {
    const value = readThemeToken(name, "", scopeElement);
    if (isOpaqueColor(value)) {
      return value;
    }
  }

  return fallback;
}

function getTerminalTheme(scopeElement?: Element | null) {
  // The terminal needs solid colors. We walk a small chain of variables so the
  // theme stays in sync with the notes pane wherever possible, but reject any
  // value that would render as black on the xterm canvas (transparent / zero
  // alpha / missing) and fall back to the light notes palette.
  const NOTES_PANE_FALLBACK = "#f4f7f1";
  const NOTES_TEXT_FALLBACK = "#233229";

  const background = readOpaqueThemeColor(
    ["--notes-terminal-bg", "--notes-pane", "--notes-surface", "--notes-bg"],
    NOTES_PANE_FALLBACK,
    scopeElement,
  );
  const foreground = readOpaqueThemeColor(
    ["--notes-text"],
    NOTES_TEXT_FALLBACK,
    scopeElement,
  );

  return {
    background,
    cursor: foreground,
    foreground,
    selectionBackground: "rgba(91, 111, 99, 0.25)",
  };
}

function getTerminalFontFamily(scopeElement?: Element | null) {
  return readThemeToken(
    "--font-mono",
    "Cascadia Code, JetBrains Mono, SFMono-Regular, monospace",
    scopeElement,
  );
}

function createSessionLabel(sessions: NotesTerminalSession[]) {
  const used = new Set(
    sessions
      .map((session) => session.label.match(/^Terminal (\d+)$/)?.[1] ?? null)
      .filter((value): value is string => value !== null)
      .map((value) => Number.parseInt(value, 10)),
  );
  let index = 1;

  while (used.has(index)) {
    index += 1;
  }

  return `Terminal ${index}`;
}

function getTerminalScopeKey(workspaceInstanceId: string | null) {
  return workspaceInstanceId ?? WINDOW_TERMINAL_SCOPE;
}

function restoreTerminalSessions(records: DesktopTerminalSessionRecord[]) {
  const nextIndexByScope = new Map<string, number>();

  return records.map((record) => {
    const scopeKey = getTerminalScopeKey(record.workspaceInstanceId ?? null);
    const index = nextIndexByScope.get(scopeKey) ?? 1;
    nextIndexByScope.set(scopeKey, index + 1);
    return {
      backend: record.backend,
      cwd: record.cwd,
      id: record.id,
      isAlive: true,
      label: `Terminal ${index}`,
      shell: record.shell,
      status: "starting" as const,
      workspaceInstanceId: record.workspaceInstanceId ?? null,
    };
  });
}

function getRendererSessionNumber(sessionId: string) {
  const match = sessionId.match(/^notes-term-(\d+)$/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : null;
}

function formatExitMessage(exitCode: number | null, signal?: string | null) {
  const exitLabel = exitCode === null ? "unknown" : String(exitCode);
  return `\r\n[Process exited with code ${exitLabel}${signal ? `, signal ${signal}` : ""}]\r\n`;
}

function formatRestartHintMessage() {
  return "[Press any key to restart]\r\n";
}

function normalizeInputForBackend(
  data: string,
  backend: DesktopTerminalSessionRecord["backend"] | null,
) {
  if (backend !== "pipe") {
    return data;
  }

  return data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function patchSessions(
  sessions: NotesTerminalSession[],
  sessionId: string,
  patch: Partial<NotesTerminalSession>,
) {
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, ...patch } : session,
  );
}

function replaceSession(
  sessions: NotesTerminalSession[],
  currentSessionId: string,
  nextSession: NotesTerminalSession,
) {
  return sessions.map((session) =>
    session.id === currentSessionId ? nextSession : session,
  );
}

async function writeTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Electron desktop windows can reject the web Clipboard API even for
      // user-initiated copy actions, so keep a native bridge fallback.
    }
  }

  if (
    typeof window !== "undefined" &&
    window.shadowingDesktop?.clipboard?.writeText
  ) {
    await window.shadowingDesktop.clipboard.writeText(text);
    return;
  }

  throw new Error("Clipboard unavailable");
}

// Reading the clipboard is the mirror image: packaged Electron windows tend to
// reject navigator.clipboard.readText() (permission denied / not focused), so
// try the native bridge first and only fall back to the web API. Returning null
// lets the caller stay silent when there is genuinely nothing to paste.
async function readTextFromClipboard(): Promise<string | null> {
  if (
    typeof window !== "undefined" &&
    window.shadowingDesktop?.clipboard?.readText
  ) {
    try {
      const text = await window.shadowingDesktop.clipboard.readText();
      if (typeof text === "string") {
        return text;
      }
    } catch {
      // Fall through to the web Clipboard API below.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  return null;
}

export function useNotesTerminalSessions({
  cwd = null,
  enabled,
  terminalBridge = null,
  workspaceInstanceId = null,
}: UseNotesTerminalSessionsInput) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef<Map<string, TerminalEntry>>(new Map());
  const initializingSessionIdsRef = useRef<Set<string>>(new Set());
  const invalidatedSessionIdsRef = useRef<Set<string>>(new Set());
  const terminatingSessionIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  // Forward refs so the xterm key handler (installed once per session inside
  // initializeSession) can always reach the latest paste/copy callbacks
  // without re-binding on every render.
  const pasteHandlerRef = useRef<() => void>(() => {});
  const copyHandlerRef = useRef<() => void>(() => {});
  const pendingInputRef = useRef<Map<string, string[]>>(new Map());
  const sessionsRef = useRef<NotesTerminalSession[]>([]);
  const nextSessionIdRef = useRef(1);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hasLoadedBackendSessions, setHasLoadedBackendSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState<NotesTerminalSession[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const createRendererSessionId = useCallback(
    () => `notes-term-${nextSessionIdRef.current++}`,
    [],
  );

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !terminalBridge) {
      setHasLoadedBackendSessions(false);
      return undefined;
    }

    setHasLoadedBackendSessions(false);
    void terminalBridge
      .list()
      .then((records) => {
        if (cancelled) {
          return;
        }

        const nextIndex = records.reduce((maximum, record) => {
          const sessionNumber = getRendererSessionNumber(record.id);
          return sessionNumber === null ? maximum : Math.max(maximum, sessionNumber + 1);
        }, 1);

        nextSessionIdRef.current = Math.max(nextSessionIdRef.current, nextIndex);
        setSessions((current) =>
          current.length ? current : restoreTerminalSessions(records),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setHasLoadedBackendSessions(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, terminalBridge]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const visibleSessions = useMemo(
    () => selectTerminalSessionsForWorkspace(sessions, workspaceInstanceId),
    [sessions, workspaceInstanceId],
  );
  const scopeKey = getTerminalScopeKey(workspaceInstanceId);

  const activateSession = useCallback(
    (sessionId: string) => {
      if (!visibleSessions.some(({ id }) => id === sessionId)) return;
      lastActiveSessionByScope.set(scopeKey, sessionId);
      setActiveSessionId(sessionId);
    },
    [scopeKey, visibleSessions],
  );

  const isSessionActive = useCallback((sessionId: string) => {
    return (
      isMountedRef.current &&
      !invalidatedSessionIdsRef.current.has(sessionId) &&
      sessionsRef.current.some((session) => session.id === sessionId)
    );
  }, []);

  const invalidateSession = useCallback((sessionId: string) => {
    invalidatedSessionIdsRef.current.add(sessionId);
    initializingSessionIdsRef.current.delete(sessionId);
  }, []);

  const fitSession = useCallback(
    (sessionId: string) => {
      const entry = entriesRef.current.get(sessionId);

      if (!entry || !terminalBridge) {
        return;
      }

      requestAnimationFrame(() => {
        try {
          entry.fitAddon.fit();
          void terminalBridge.resize(sessionId, {
            cols: entry.terminal.cols || DEFAULT_COLS,
            rows: entry.terminal.rows || DEFAULT_ROWS,
          });
        } catch {
          // Hidden terminals cannot always be measured.
        }
      });
    },
    [terminalBridge],
  );

  const showActiveSession = useCallback(
    (sessionId: string | null) => {
      entriesRef.current.forEach((entry, id) => {
        entry.container.style.display = id === sessionId ? "block" : "none";
      });

      if (sessionId) {
        fitSession(sessionId);
        entriesRef.current.get(sessionId)?.terminal.focus();
      }
    },
    [fitSession],
  );

  const disposeEntry = useCallback((sessionId: string) => {
    const entry = entriesRef.current.get(sessionId);

    if (!entry) {
      return;
    }

    entry.terminal.dispose();
    entry.container.remove();
    entriesRef.current.delete(sessionId);
    initializingSessionIdsRef.current.delete(sessionId);
  }, []);

  const queuePendingInput = useCallback((sessionId: string, data: string) => {
    const current = pendingInputRef.current.get(sessionId) ?? [];
    pendingInputRef.current.set(sessionId, [...current, data]);
  }, []);

  const consumePendingInput = useCallback((sessionId: string) => {
    const pendingInput = pendingInputRef.current.get(sessionId) ?? [];

    pendingInputRef.current.delete(sessionId);
    return pendingInput.join("");
  }, []);

  const createSession = useCallback(() => {
    const currentVisibleSessions = selectTerminalSessionsForWorkspace(
      sessionsRef.current,
      workspaceInstanceId,
    );
    if (currentVisibleSessions.length >= MAX_SESSIONS) {
      return;
    }

    const nextId = createRendererSessionId();

    setSessions((current) => {
      const visibleCurrent = selectTerminalSessionsForWorkspace(
        current,
        workspaceInstanceId,
      );
      if (visibleCurrent.length >= MAX_SESSIONS) {
        return current;
      }

      const nextSessions: NotesTerminalSession[] = [
        ...current,
        {
          backend: null,
          cwd: null,
          id: nextId,
          isAlive: true,
          label: createSessionLabel(visibleCurrent),
          shell: null,
          status: "starting",
          workspaceInstanceId,
        },
      ];
      sessionsRef.current = nextSessions;
      return nextSessions;
    });

    setActiveSessionId(nextId);
    lastActiveSessionByScope.set(scopeKey, nextId);
  }, [createRendererSessionId, scopeKey, workspaceInstanceId]);

  const markSession = useCallback(
    (sessionId: string, patch: Partial<NotesTerminalSession>) => {
      setSessions((current) => {
        const nextSessions = patchSessions(current, sessionId, patch);
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
    },
    [],
  );

  const queueSessionRestart = useCallback(
    (sessionId: string, initialInput?: string) => {
      const currentSession = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );

      if (!currentSession) {
        return;
      }

      const nextSessionId = createRendererSessionId();
      const pendingInput = pendingInputRef.current.get(sessionId) ?? [];
      const replayInput = initialInput ? [...pendingInput, initialInput] : pendingInput;

      pendingInputRef.current.delete(sessionId);
      if (replayInput.length > 0) {
        pendingInputRef.current.set(nextSessionId, replayInput);
      }

      invalidateSession(sessionId);
      terminatingSessionIdsRef.current.add(sessionId);
      terminalBridge?.kill(sessionId).catch(() => undefined);
      disposeEntry(sessionId);
      const nextSession = {
        ...currentSession,
        backend: null,
        id: nextSessionId,
        isAlive: true,
        shell: null,
        status: "starting",
      } satisfies NotesTerminalSession;

      setSessions((current) => {
        const nextSessions = replaceSession(current, sessionId, nextSession);
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
      setActiveSessionId((current) =>
        current === sessionId ? nextSessionId : current,
      );
      if (lastActiveSessionByScope.get(scopeKey) === sessionId) {
        lastActiveSessionByScope.set(scopeKey, nextSessionId);
      }
      setStatusMessage(null);
    },
    [createRendererSessionId, disposeEntry, invalidateSession, scopeKey, terminalBridge],
  );

  const initializeSession = useCallback(
    async (session: NotesTerminalSession) => {
      if (
        !terminalBridge ||
        !hostRef.current ||
        entriesRef.current.has(session.id) ||
        initializingSessionIdsRef.current.has(session.id) ||
        invalidatedSessionIdsRef.current.has(session.id)
      ) {
        return;
      }

      initializingSessionIdsRef.current.add(session.id);
      const container = document.createElement("div");
      container.className = "notes-v2__terminal-xterm";
      container.style.display = session.id === activeSessionId ? "block" : "none";
      hostRef.current.appendChild(container);

      try {
        const [
          { Terminal },
          { FitAddon },
          { SearchAddon },
          { WebLinksAddon },
          { Unicode11Addon },
        ] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-search"),
          import("@xterm/addon-web-links"),
          import("@xterm/addon-unicode11"),
        ]);

        if (!isSessionActive(session.id) || !container.isConnected) {
          container.remove();
          return;
        }

        const terminal = new Terminal({
          allowProposedApi: true,
          convertEol: false,
          cursorBlink: true,
          fontFamily: getTerminalFontFamily(container),
          fontSize: 13,
          lineHeight: 1.25,
          scrollback: 5000,
          theme: getTerminalTheme(container),
        });
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        const unicodeAddon = new Unicode11Addon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        terminal.loadAddon(unicodeAddon);
        terminal.unicode.activeVersion = "11";
        terminal.loadAddon(
          new WebLinksAddon((_event, uri) => {
            try {
              const parsed = new URL(uri);
              if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
                return;
              }
              window.open(uri, "_blank", "noopener,noreferrer");
            } catch {
              // Ignore malformed terminal output links.
            }
          }),
        );

        // Bind clipboard shortcuts. xterm.js does not paste on Ctrl+V by
        // default (Ctrl+V is a legitimate control character for some shells),
        // so we intercept the common paste/copy chords and route them through
        // the native clipboard bridge. Returning false tells xterm to swallow
        // the key so it does not also send raw bytes to the shell.
        terminal.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown") {
            return true;
          }

          const key = event.key.toLowerCase();
          const primaryModifier = event.ctrlKey || event.metaKey;

          // Paste: Ctrl+V / Cmd+V, and Shift+Insert.
          if (primaryModifier && key === "v") {
            event.preventDefault();
            pasteHandlerRef.current();
            return false;
          }
          if (event.shiftKey && key === "insert") {
            event.preventDefault();
            pasteHandlerRef.current();
            return false;
          }

          // Copy: only hijack Ctrl+C / Cmd+C when there is an active selection,
          // otherwise let Ctrl+C through as SIGINT so the user can still
          // interrupt a running command.
          if (primaryModifier && key === "c" && terminal.hasSelection()) {
            event.preventDefault();
            copyHandlerRef.current();
            return false;
          }

          return true;
        });

        terminal.open(container);
        fitAddon.fit();
        entriesRef.current.set(session.id, {
          container,
          fitAddon,
          searchAddon,
          terminal,
        });

        const record = await terminalBridge.resume({
          cols: terminal.cols || DEFAULT_COLS,
          cwd,
          rows: terminal.rows || DEFAULT_ROWS,
          sessionId: session.id,
          workspaceInstanceId: session.workspaceInstanceId,
        });

        if (!isSessionActive(session.id)) {
          if (terminatingSessionIdsRef.current.has(session.id)) {
            void terminalBridge.kill(record.id).catch(() => undefined);
          }
          pendingInputRef.current.delete(session.id);
          disposeEntry(session.id);
          return;
        }

        markSession(session.id, {
          backend: record.backend,
          cwd: record.cwd,
          isAlive: true,
          shell: record.shell,
          status: "running",
          workspaceInstanceId: record.workspaceInstanceId ?? session.workspaceInstanceId,
        });
        setStatusMessage(null);
        if (record.output) {
          terminal.write(record.output);
        }
        const pendingInput = consumePendingInput(session.id);

        if (pendingInput) {
          void terminalBridge
            .write(
              session.id,
              normalizeInputForBackend(pendingInput, record.backend),
            )
            .catch((error) => {
              markSession(session.id, {
                isAlive: false,
                status: "failed",
              });
              terminal.write(
                `\r\n[Terminal write failed: ${
                  error instanceof Error ? error.message : String(error)
                }]\r\n`,
              );
            });
        } else if (record.backend === "pipe") {
          void terminalBridge.write(session.id, "\n").catch(() => undefined);
        }

        terminal.onData((data) => {
          const currentSession = sessionsRef.current.find(
            (item) => item.id === session.id,
          );

          if (!currentSession) {
            return;
          }

          if (currentSession.status === "starting") {
            queuePendingInput(session.id, data);
            return;
          }

          if (currentSession.status !== "running") {
            queueSessionRestart(session.id, data);
            return;
          }

          const normalizedData = normalizeInputForBackend(
            data,
            currentSession.backend,
          );
          void terminalBridge.write(session.id, normalizedData).catch(() => {
            queueSessionRestart(session.id, data);
          });
        });

        showActiveSession(activeSessionId);
      } catch (error) {
        pendingInputRef.current.delete(session.id);
        disposeEntry(session.id);
        container.remove();
        if (!isSessionActive(session.id)) {
          return;
        }
        markSession(session.id, {
          isAlive: false,
          status: "failed",
        });
        setStatusMessage(
          error instanceof Error ? error.message : "Terminal failed to start.",
        );
      } finally {
        initializingSessionIdsRef.current.delete(session.id);
      }
    },
    [
      activeSessionId,
      cwd,
      consumePendingInput,
      disposeEntry,
      isSessionActive,
      markSession,
      queuePendingInput,
      queueSessionRestart,
      showActiveSession,
      terminalBridge,
    ],
  );

  useEffect(() => {
    if (!enabled || !terminalBridge || !hasLoadedBackendSessions) {
      return;
    }

    if (visibleSessions.length === 0) {
      createSession();
    }
  }, [createSession, enabled, hasLoadedBackendSessions, terminalBridge, visibleSessions.length]);

  useEffect(() => {
    const nextActiveSessionId = selectActiveTerminalSessionId(
      sessions,
      workspaceInstanceId,
      activeSessionId,
      lastActiveSessionByScope.get(scopeKey) ?? null,
    );
    if (nextActiveSessionId) {
      lastActiveSessionByScope.set(scopeKey, nextActiveSessionId);
    }
    if (nextActiveSessionId !== activeSessionId) {
      setActiveSessionId(nextActiveSessionId);
    }
  }, [activeSessionId, scopeKey, sessions, workspaceInstanceId]);

  useEffect(() => {
    if (!enabled || !terminalBridge) {
      return;
    }

    visibleSessions.forEach((session) => {
      if (session.status === "starting") {
        void initializeSession(session);
      }
    });
  }, [enabled, initializeSession, terminalBridge, visibleSessions]);

  useEffect(() => {
    showActiveSession(activeSessionId);
  }, [activeSessionId, showActiveSession]);

  useEffect(() => {
    if (!terminalBridge) {
      return undefined;
    }

    const removeDataListener = terminalBridge.onData((event) => {
      entriesRef.current.get(event.sessionId)?.terminal.write(event.data);
    });
    const removeExitListener = terminalBridge.onExit((event) => {
      const entry = entriesRef.current.get(event.sessionId);
      entry?.terminal.write(formatExitMessage(event.exitCode, event.signal));
      entry?.terminal.write(formatRestartHintMessage());
      markSession(event.sessionId, {
        isAlive: false,
        status: event.errorMessage ? "failed" : "exited",
      });
    });

    return () => {
      removeDataListener();
      removeExitListener();
    };
  }, [markSession, terminalBridge]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (activeSessionId) {
        fitSession(activeSessionId);
      }
    });
    observer.observe(host);

    return () => observer.disconnect();
  }, [activeSessionId, fitSession]);

  useEffect(() => {
    const entry = activeSessionId
      ? entriesRef.current.get(activeSessionId)
      : null;

    if (!entry) {
      return;
    }

    if (searchQuery) {
      entry.searchAddon.findNext(searchQuery);
      return;
    }

    entry.searchAddon.clearDecorations();
  }, [activeSessionId, searchQuery]);

  useEffect(() => {
    const disposeAllEntries = () => {
      sessionsRef.current.forEach((session) => {
        invalidateSession(session.id);
      });
      entriesRef.current.forEach((entry, sessionId) => {
        pendingInputRef.current.delete(sessionId);
        entry.terminal.dispose();
        entry.container.remove();
      });
      entriesRef.current.clear();
      pendingInputRef.current.clear();
    };

    return disposeAllEntries;
  }, [invalidateSession]);

  const closeSession = useCallback(
    (sessionId: string) => {
      invalidateSession(sessionId);
      terminatingSessionIdsRef.current.add(sessionId);
      terminalBridge?.kill(sessionId).catch(() => undefined);
      pendingInputRef.current.delete(sessionId);
      disposeEntry(sessionId);
      setSessions((current) => {
        const nextSessions = current.filter((session) => session.id !== sessionId);

        if (activeSessionId === sessionId) {
          const nextActiveSessionId = selectTerminalSessionsForWorkspace(
              nextSessions,
              workspaceInstanceId,
            ).at(-1)?.id ?? null;
          if (nextActiveSessionId) {
            lastActiveSessionByScope.set(scopeKey, nextActiveSessionId);
          } else {
            lastActiveSessionByScope.delete(scopeKey);
          }
          setActiveSessionId(nextActiveSessionId);
        }

        return nextSessions;
      });
    },
    [activeSessionId, disposeEntry, invalidateSession, scopeKey, terminalBridge, workspaceInstanceId],
  );

  const closeActiveSession = useCallback(() => {
    if (activeSessionId) {
      closeSession(activeSessionId);
    }
  }, [activeSessionId, closeSession]);

  const restartSession = useCallback(
    (sessionId: string) => {
      queueSessionRestart(sessionId);
    },
    [queueSessionRestart],
  );

  const restartActiveSession = useCallback(() => {
    if (activeSessionId) {
      restartSession(activeSessionId);
    }
  }, [activeSessionId, restartSession]);

  const writeInputToSession = useCallback(
    (sessionId: string, data: string) => {
      if (!data || !terminalBridge) {
        return;
      }

      const currentSession = sessionsRef.current.find(
        (item) => item.id === sessionId,
      );

      if (!currentSession) {
        return;
      }

      if (currentSession.status === "starting") {
        queuePendingInput(sessionId, data);
        return;
      }

      if (currentSession.status !== "running") {
        queueSessionRestart(sessionId, data);
        return;
      }

      const normalizedData = normalizeInputForBackend(
        data,
        currentSession.backend,
      );
      void terminalBridge.write(sessionId, normalizedData).catch(() => {
        queueSessionRestart(sessionId, data);
      });
    },
    [queuePendingInput, queueSessionRestart, terminalBridge],
  );

  const clearActiveSession = useCallback(() => {
    if (!activeSessionId) {
      return;
    }

    const terminal = entriesRef.current.get(activeSessionId)?.terminal;

    terminal?.clear();
    terminal?.focus();
  }, [activeSessionId]);

  const copyActiveSelection = useCallback(() => {
    if (!activeSessionId) {
      return;
    }

    const selection = entriesRef.current
      .get(activeSessionId)
      ?.terminal.getSelection()
      .trimEnd();

    if (!selection) {
      return;
    }

    void writeTextToClipboard(selection)
      .then(() => setStatusMessage(null))
      .catch(() => {
        setStatusMessage("Clipboard copy failed.");
      });
  }, [activeSessionId]);

  const pasteIntoActiveSession = useCallback(async () => {
    if (!activeSessionId) {
      return;
    }

    try {
      const clipboardText = await readTextFromClipboard();

      if (!clipboardText) {
        return;
      }

      writeInputToSession(activeSessionId, clipboardText);
      entriesRef.current.get(activeSessionId)?.terminal.focus();
      setStatusMessage(null);
    } catch {
      setStatusMessage("Clipboard paste failed.");
    }
  }, [activeSessionId, writeInputToSession]);

  // Keep the refs consumed by the xterm key handler (installed once per
  // session in initializeSession) pointed at the latest paste/copy callbacks.
  useEffect(() => {
    pasteHandlerRef.current = () => {
      void pasteIntoActiveSession();
    };
    copyHandlerRef.current = () => {
      copyActiveSelection();
    };
  }, [copyActiveSelection, pasteIntoActiveSession]);

  const selectAllActiveSession = useCallback(() => {
    if (!activeSessionId) {
      return;
    }

    const terminal = entriesRef.current.get(activeSessionId)?.terminal;

    terminal?.selectAll();
    terminal?.focus();
  }, [activeSessionId]);

  const focusActiveSession = useCallback(() => {
    if (!activeSessionId) {
      return;
    }

    entriesRef.current.get(activeSessionId)?.terminal.focus();
  }, [activeSessionId]);

  return {
    activeSessionId,
    activeSession: visibleSessions.find((session) => session.id === activeSessionId) ?? null,
    clearActiveSession,
    closeActiveSession,
    copyActiveSelection,
    createSession,
    focusActiveSession,
    hostRef,
    isMaxed: visibleSessions.length >= MAX_SESSIONS,
    pasteIntoActiveSession,
    restartActiveSession,
    searchQuery,
    selectAllActiveSession,
    sessions: visibleSessions,
    setActiveSessionId: activateSession,
    setSearchQuery,
    statusMessage,
  };
}
