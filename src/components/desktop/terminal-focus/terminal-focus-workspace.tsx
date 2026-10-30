"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent } from "react";
import { ArrowClockwise, ArrowsIn, ArrowsOut, ClockCounterClockwise, Copy, MagnifyingGlass, Plus, TerminalWindow, Trash, X, ClipboardText } from "@phosphor-icons/react";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import type { DesktopTerminalBridge } from "@/platform/desktop/desktop-bridge";
import { useAppTheme } from "@/features/appearance/use-app-theme";
import { DEFAULT_NOTES_TYPOGRAPHY, loadNotesTypography, NOTES_TYPOGRAPHY_EVENT, notesTypographyCssVars } from "@/features/notes/formatting/notes-typography";
import { useNotesTerminalSessions, type NotesTerminalSession } from "@/components/notes-v2/terminal/use-notes-terminal-sessions";
import { NotesTerminalTranscript } from "@/components/notes-v2/terminal/notes-terminal-transcript";
import { terminalTabGlyph } from "@/components/notes-v2/terminal/notes-terminal-options";
import { DEFAULT_FOCUS_LAYOUT, normalizeFocusLayout, normalizeWeights, resizeTracks, TERMINAL_FOCUS_LAYOUT_KEY, TERMINAL_FOCUS_GAP, TERMINAL_FOCUS_LIMIT, TERMINAL_FOCUS_SCOPE, type FocusLayout } from "./terminal-focus-layout";
import { TerminalProjectDialog } from "./terminal-project-dialog";
import "./terminal-focus.css";

const STATUS_LABELS = { starting: "启动中", running: "运行中", exited: "已退出", failed: "失败" } as const;

function ToolButton({ label, children, onClick, disabled, pressed }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button type="button" className="terminal-focus__tool" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>;
}

function SessionPane({ session, active, hidden, singlePane, registerHost, activate, close, restart, toggleSingle }: {
  session: NotesTerminalSession; active: boolean; hidden: boolean; singlePane: boolean;
  registerHost: (id: string, host: HTMLDivElement | null) => void;
  activate: (id: string) => void; close: (id: string) => void; restart: (id: string) => void; toggleSingle: (id: string) => void;
}) {
  const hostRef = useCallback((host: HTMLDivElement | null) => registerHost(session.id, host), [registerHost, session.id]);
  const title = session.programTitle || session.label;
  return <section className="terminal-focus__pane" data-session-id={session.id} data-active={active} hidden={hidden}
    aria-label={`${title} 终端面板`} onPointerDownCapture={() => activate(session.id)} onFocusCapture={() => activate(session.id)}>
    <header className="terminal-focus__pane-header">
      <button className="terminal-focus__pane-title" type="button" onClick={() => activate(session.id)} title={session.cwd ?? title}>
        <span className="terminal-focus__status-dot" data-status={session.status} /><span>{title}</span>
      </button>
      <div className="terminal-focus__pane-tools">
        <ToolButton label={`重启 ${session.label}`} onClick={() => restart(session.id)}><ArrowClockwise size={14} /></ToolButton>
        <ToolButton label={singlePane ? "恢复分屏" : `专注 ${session.label}`} onClick={() => toggleSingle(session.id)}>{singlePane ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}</ToolButton>
        <ToolButton label={`关闭 ${session.label}`} onClick={() => close(session.id)}><X size={14} /></ToolButton>
      </div>
    </header>
    <div className="terminal-focus__pane-host" ref={hostRef} />
    <footer className="terminal-focus__pane-footer"><span title={session.cwd ? `启动目录：${session.cwd}` : undefined}>{session.cwd || "正在连接本地 Shell"}</span><span>{session.backend === "pipe" ? "管道回退 · 非完整 TTY" : STATUS_LABELS[session.status]}</span></footer>
  </section>;
}

function TrackSeparator({ axis, index, weights, onResize, singlePane }: {
  axis: "column" | "row"; index: number; weights: number[]; onResize: (weights: number[]) => void; singlePane: boolean;
}) {
  const drag = useRef<{ start: number; size: number; weights: number[] } | null>(null);
  const offset = weights.slice(0, index + 1).reduce((sum, value) => sum + value, 0) * 100;
  const vertical = axis === "column";
  // Fractional tracks share only the space left after Grid gaps. The handle
  // occupies the actual gap, including when tracks have unequal weights.
  const gapOffset = index * TERMINAL_FOCUS_GAP - (weights.length - 1) * TERMINAL_FOCUS_GAP * offset / 100;
  const position = `calc(${offset}% + ${gapOffset}px)`;
  const stop = () => { drag.current = null; };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const coordinate = vertical ? event.clientX : event.clientY;
    onResize(resizeTracks(drag.current.weights, index, (coordinate - drag.current.start) / drag.current.size));
  };
  return <div className={`terminal-focus__separator terminal-focus__separator--${axis}`} role="separator" tabIndex={singlePane ? -1 : 0}
    aria-label={vertical ? `调整第 ${index + 1} 列宽度` : `调整第 ${index + 1} 行高度`} aria-orientation={vertical ? "vertical" : "horizontal"}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(offset)} hidden={singlePane}
    style={vertical ? { left: position } : { top: position }}
    onDoubleClick={() => onResize(normalizeWeights([], weights.length))}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
      drag.current = { start: vertical ? event.clientX : event.clientY, size: Math.max(1, (vertical ? bounds.width : bounds.height) - (weights.length - 1) * TERMINAL_FOCUS_GAP), weights };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={(event) => {
      const previous = vertical ? "ArrowLeft" : "ArrowUp";
      const next = vertical ? "ArrowRight" : "ArrowDown";
      if (event.key === previous || event.key === next) { event.preventDefault(); onResize(resizeTracks(weights, index, event.key === next ? 0.025 : -0.025)); }
      if (event.key === "Home") { event.preventDefault(); onResize(normalizeWeights([], weights.length)); }
    }} />;
}

export function TerminalFocusWorkspace({ bridge, ready = true }: { bridge: DesktopTerminalBridge | null; ready?: boolean }) {
  const theme = useAppTheme();
  const [typography, setTypography] = useState(DEFAULT_NOTES_TYPOGRAPHY);
  const [layout, setLayout] = useState<FocusLayout>(DEFAULT_FOCUS_LAYOUT);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [singlePane, setSinglePane] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const transcriptId = useId();
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  const terminal = useNotesTerminalSessions({
    enabled: Boolean(bridge), terminalBridge: bridge, workspaceInstanceId: TERMINAL_FOCUS_SCOPE,
    multiPane: true, singlePane, autoCreateSession: false, maxSessions: TERMINAL_FOCUS_LIMIT, strictWorkspaceScope: true,
    sessionIdPrefix: "focus-term", onSearch: toggleSearch,
  });
  const { sessions, activeSessionId, activeSession, setActiveSessionId, hostRef, setSearchQuery } = terminal;

  useEffect(() => {
    try { setLayout(normalizeFocusLayout(JSON.parse(localStorage.getItem(TERMINAL_FOCUS_LAYOUT_KEY) ?? "null"))); } catch { /* Corrupt preferences must not block Shell startup. */ }
    setPreferencesLoaded(true);
    const syncTypography = () => setTypography(loadNotesTypography());
    syncTypography();
    window.addEventListener(NOTES_TYPOGRAPHY_EVENT, syncTypography);
    window.addEventListener("storage", syncTypography);
    return () => { window.removeEventListener(NOTES_TYPOGRAPHY_EVENT, syncTypography); window.removeEventListener("storage", syncTypography); };
  }, []);
  useEffect(() => {
    if (preferencesLoaded) try { localStorage.setItem(TERMINAL_FOCUS_LAYOUT_KEY, JSON.stringify(layout)); } catch { /* In-memory layout remains usable. */ }
  }, [layout, preferencesLoaded]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
    else setSearchQuery("");
  }, [searchOpen, setSearchQuery]);
  useEffect(() => {
    if (!contextMenu) return;
    menuRef.current?.focus();
    const dismiss = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null); };
    window.addEventListener("pointerdown", dismiss);
    const dismissOnResize = () => setContextMenu(null);
    window.addEventListener("resize", dismissOnResize);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("resize", dismissOnResize); };
  }, [contextMenu]);

  const columns = singlePane ? 1 : Math.min(layout.columns, Math.max(1, sessions.length));
  const rows = singlePane ? 1 : Math.max(1, Math.ceil(sessions.length / columns));
  const columnWeights = normalizeWeights(layout.columnWeights, columns);
  const rowWeights = normalizeWeights(layout.rowWeights, rows);
  const canTranscript = Boolean(bridge?.readTranscript && bridge?.configureTranscript && bridge?.transcriptStatus);
  const toggleSingle = (id: string) => { setActiveSessionId(id); setSinglePane((value) => !value); };
  const runMenu = (action: () => unknown) => { setContextMenu(null); void action(); };

  return <div className="notes-v2 notes-v2--minimal terminal-focus" data-notes-theme={theme} style={notesTypographyCssVars(typography) as CSSProperties}>
    <aside className="terminal-focus__sidebar" aria-label="终端会话" inert={projectPickerOpen}>
      <div className="terminal-focus__sidebar-heading"><TerminalWindow size={18} /><h1>终端模式</h1><span>{sessions.length}/8</span>
        <ToolButton label="新建终端" disabled={!bridge || terminal.isRestoring || terminal.isMaxed} onClick={() => setProjectPickerOpen(true)}><Plus size={17} /></ToolButton>
      </div>
      <div className="terminal-focus__session-list" role="tablist" aria-label="终端会话列表" aria-orientation="vertical">
        {sessions.map((session) => <button key={session.id} type="button" role="tab" aria-selected={session.id === activeSessionId}
          className="terminal-focus__session" data-active={session.id === activeSessionId} onClick={() => setActiveSessionId(session.id)} title={session.cwd ?? session.label}>
          <span className="terminal-focus__session-glyph">{terminalTabGlyph(session.label, session.programTitle)}</span>
          <span className="terminal-focus__session-info"><strong>{session.programTitle || session.label}</strong><small><span className="terminal-focus__status-dot" data-status={session.status} />{STATUS_LABELS[session.status]}</small></span>
        </button>)}
      </div>
      <div className="terminal-focus__sidebar-bottom"><span>最多同时展示 8 个终端</span><span>切换页面不会结束运行中的会话</span></div>
    </aside>
    <main className="terminal-focus__main" aria-label="专注终端工作区" inert={projectPickerOpen}>
      <header className="terminal-focus__toolbar">
        <span className="terminal-focus__workspace-title">{singlePane ? "单屏专注" : "分屏工作台"}</span>
        <label className="terminal-focus__layout-picker">布局<select aria-label="终端分屏列数" value={layout.columns} onChange={(event) => {
          setLayout({ columns: Number(event.target.value), columnWeights: [], rowWeights: [] }); setSinglePane(false);
        }}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 列</option>)}</select></label>
        <ToolButton label={singlePane ? "恢复全部分屏" : "专注当前终端"} pressed={singlePane} disabled={!activeSession} onClick={() => setSinglePane((value) => !value)}>{singlePane ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}</ToolButton>
        <div className="terminal-focus__toolbar-spacer" />
        <ToolButton label="搜索当前终端" pressed={searchOpen} disabled={!activeSession} onClick={toggleSearch}><MagnifyingGlass size={16} /></ToolButton>
        <ToolButton label="复制选区" disabled={!activeSession} onClick={terminal.copyActiveSelection}><Copy size={16} /></ToolButton>
        <ToolButton label="粘贴到当前终端" disabled={!activeSession} onClick={() => void terminal.pasteIntoActiveSession()}><ClipboardText size={16} /></ToolButton>
        <ToolButton label="清空当前终端" disabled={!activeSession} onClick={terminal.clearActiveSession}><Trash size={16} /></ToolButton>
        {canTranscript && <ToolButton label="Agent 执行记录" pressed={transcriptOpen} disabled={!activeSession} onClick={() => setTranscriptOpen((value) => !value)}><ClockCounterClockwise size={16} /></ToolButton>}
      </header>
      {searchOpen && <div className="notes-v2__terminal-search terminal-focus__search" role="search" aria-label="搜索当前终端内容">
        <MagnifyingGlass size={15} /><input ref={searchRef} aria-label="搜索终端内容" placeholder="搜索当前终端…" value={terminal.searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); terminal.focusActiveSession(); } }} />
        <ToolButton label="关闭搜索" onClick={() => { setSearchOpen(false); terminal.focusActiveSession(); }}><X size={15} /></ToolButton>
      </div>}
      {terminal.statusMessage && <div className="terminal-focus__error" role="alert">{terminal.statusMessage}</div>}
      <div className="terminal-focus__canvas">
        <div className="terminal-focus__grid" ref={hostRef} data-pane-count={sessions.length} data-single-pane={singlePane} style={{
          "--terminal-focus-gap": `${TERMINAL_FOCUS_GAP}px`,
          gridTemplateColumns: columnWeights.map((weight) => `${weight}fr`).join(" "),
          gridTemplateRows: rowWeights.map((weight) => `${weight}fr`).join(" "),
          minWidth: Math.max(260, columns * 240), minHeight: Math.max(0, rows * 170),
        } as CSSProperties} onContextMenu={(event) => {
          const pane = (event.target as Element).closest<HTMLElement>("[data-session-id]");
          if (!pane?.dataset.sessionId) return;
          event.preventDefault(); setActiveSessionId(pane.dataset.sessionId);
          setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 225) });
        }}>
          {sessions.map((session) => <SessionPane key={session.id} session={session} active={session.id === activeSessionId}
            hidden={singlePane && session.id !== activeSessionId} singlePane={singlePane} registerHost={terminal.registerSessionHost}
            activate={setActiveSessionId} close={terminal.closeSession} restart={terminal.restartSession} toggleSingle={toggleSingle} />)}
          {columnWeights.slice(0, -1).map((_, index) => <TrackSeparator key={`column-${index}`} axis="column" index={index} weights={columnWeights} singlePane={singlePane} onResize={(weights) => setLayout((previous) => ({ ...previous, columnWeights: weights }))} />)}
          {rowWeights.slice(0, -1).map((_, index) => <TrackSeparator key={`row-${index}`} axis="row" index={index} weights={rowWeights} singlePane={singlePane} onResize={(weights) => setLayout((previous) => ({ ...previous, rowWeights: weights }))} />)}
        </div>
        {!sessions.length && <div className="terminal-focus__empty"><TerminalWindow size={32} /><h2>{!ready ? "正在连接桌面终端…" : terminal.isRestoring ? "正在恢复终端会话…" : bridge ? "开始一个终端会话" : "终端仅在 Auris 桌面端可用"}</h2>
          <p>{bridge ? "选择文件夹或最近项目，在对应目录启动本机默认 Shell。" : "请在桌面应用中打开终端模式。"}</p>
          {bridge && <button type="button" disabled={terminal.isRestoring} onClick={() => setProjectPickerOpen(true)}>新建终端</button>}
        </div>}
      </div>
      {transcriptOpen && canTranscript && bridge && <NotesTerminalTranscript bridge={bridge} sessionId={activeSessionId} id={transcriptId} />}
      <footer className="terminal-focus__footer"><span>{activeSession?.shell ?? "本地 Shell"}</span><span>{singlePane ? "1" : sessions.length} 个可见 · {sessions.length} 个会话</span><span>拖动分隔线调整布局 · 双击还原比例</span></footer>
    </main>
    {projectPickerOpen && bridge && <TerminalProjectDialog bridge={bridge} onClose={() => setProjectPickerOpen(false)} onCreate={(cwd) => {
      if (terminal.isMaxed || terminal.isRestoring) return;
      setProjectPickerOpen(false);
      terminal.createSession(cwd);
    }} />}
    {contextMenu && <div ref={menuRef} className="terminal-focus__context-menu" role="menu" aria-label="终端操作" tabIndex={-1} style={{ left: Math.max(0, contextMenu.x), top: Math.max(0, contextMenu.y) }} onKeyDown={(event) => { if (event.key === "Escape") { setContextMenu(null); terminal.focusActiveSession(); } }}>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.copyActiveSelection)}>复制选区</button>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.pasteIntoActiveSession)}>粘贴</button>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.selectAllActiveSession)}>全选</button>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.clearActiveSession)}>清空终端</button>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.restartActiveSession)}>重启当前终端</button>
      <button type="button" role="menuitem" onClick={() => runMenu(terminal.closeActiveSession)}>关闭当前终端</button>
    </div>}
  </div>;
}

export function TerminalFocusPage() {
  const { desktopBridge, hasHydratedDesktopBridge } = useHydratedDesktopBridge();
  return <DesktopAppFrame activeNavId="terminal" activeWorkspace="notes" persistActiveWorkspace={false} sidebarVisible title="终端模式" subtitle="专注终端工作台" windowTitle="终端模式">
    <TerminalFocusWorkspace bridge={desktopBridge?.terminal ?? null} ready={hasHydratedDesktopBridge} />
  </DesktopAppFrame>;
}
