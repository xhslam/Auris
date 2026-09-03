"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { NiaModelRoutingPanel, loadNiaRoutingPreference } from "@/components/nia/nia-model-routing-panel";
import { NiaOperationsPanel } from "@/components/nia/nia-operations-panel";
import { NiaConversationArchive } from "@/components/nia/nia-conversation-archive";
import { NiaConversationPanel } from "@/components/nia/nia-conversation-panel";
import { NiaTextSidePane, type NiaTextPaneTab } from "@/components/nia/nia-text-side-pane";
import { getNiaStandaloneBridge } from "@/features/nia/nia-standalone-bridge";
import { listNiaToolsForContext } from "@/features/nia/nia-tool-registry";
import { useNiaStandaloneStore } from "@/features/nia/nia-standalone-store";
import { getNiaCompanionHostBridge } from "@/features/nia/nia-companion-bridge";
import { activeNiaMemories, formatNiaConfirmedMemoriesForPrompt, loadNiaMemories, type NiaMemoryRecord } from "@/features/nia/nia-memory-service";
import { useHomeLearningSummary } from "@/features/home-learning/use-home-learning-summary";
import { useNiaTaskStore } from "@/features/nia/nia-task-store";
import { useNiaSession } from "@/features/nia/use-nia-session";

type InspectorTab = "conversations" | "memory" | "tasks" | "tools";
type NiaAccentTheme = "violet" | "gold" | "blue";
type CompanionSnapshot = { state?: string; muted?: boolean; visible?: boolean; savingConversations?: boolean; pendingReminder?: { count?: number } | null };

const voiceOptions = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "cedar", "marin"];
const NIA_INSPECTOR_WIDTH_STORAGE_KEY = "auris.nia.inspector-width";
const NIA_INSPECTOR_DEFAULT_WIDTH = 320;
const NIA_INSPECTOR_MIN_WIDTH = 280;
const NIA_INSPECTOR_MAX_WIDTH = 640;
const NIA_MAIN_STAGE_MIN_WIDTH = 480;
const NIA_RESIZE_HANDLE_WIDTH = 18;

export function constrainNiaInspectorWidth(requestedWidth: number, workspaceWidth: number) {
  const availableMaximum = workspaceWidth - NIA_MAIN_STAGE_MIN_WIDTH - NIA_RESIZE_HANDLE_WIDTH;
  const maximum = Math.max(
    NIA_INSPECTOR_MIN_WIDTH,
    Math.min(NIA_INSPECTOR_MAX_WIDTH, availableMaximum),
  );
  return Math.round(Math.min(maximum, Math.max(NIA_INSPECTOR_MIN_WIDTH, requestedWidth)));
}

function statusCopy(value: string) {
  switch (value) {
    case "opening": return "正在醒来";
    case "listening": return "正在聆听";
    case "attending": return "正在聆听";
    case "thinking": return "正在思考";
    case "speaking": return "正在回应";
    case "failed": return "需要重新连接";
    default: return "准备陪你学习";
  }
}

function NiaAvatar({ onActivate, state }: { onActivate: () => void; state: string }) {
  const active = ["opening", "listening", "attending", "thinking", "speaking", "working"].includes(state);
  return (
    <button aria-label={active ? "让 Nia 休息" : "唤醒 Nia"} aria-pressed={active} className="nia-workspace__avatar-wrap" data-avatar-state={state} onClick={onActivate} type="button">
      <div className="nia-workspace__stars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="nia-workspace__avatar">
        <div className="nia-workspace__avatar-ear nia-workspace__avatar-ear--left" />
        <div className="nia-workspace__avatar-ear nia-workspace__avatar-ear--right" />
        <div className="nia-workspace__avatar-head">
          <span className="nia-workspace__avatar-eye nia-workspace__avatar-eye--left" />
          <span className="nia-workspace__avatar-eye nia-workspace__avatar-eye--right" />
          <span className="nia-workspace__avatar-mouth" />
          <span className="nia-workspace__avatar-cheek nia-workspace__avatar-cheek--left" />
          <span className="nia-workspace__avatar-cheek nia-workspace__avatar-cheek--right" />
        </div>
        <div className="nia-workspace__avatar-body"><span /><span /></div>
        <div className="nia-workspace__avatar-shadow" />
      </div>
      <div className="nia-workspace__thinking-dots" aria-hidden="true"><i /><i /><i /></div>
    </button>
  );
}

export function NiaWorkspaceSurface() {
  const textSession = useNiaSession();
  const activeContextCardId = useNiaStandaloneStore((state) => state.activeContextCardId);
  const browserTarget = useNiaStandaloneStore((state) => state.browserTarget);
  const context = useNiaStandaloneStore((state) => state.context);
  const contextCards = useNiaStandaloneStore((state) => state.contextCards);
  const contextToken = useNiaStandaloneStore((state) => state.contextToken);
  const open = useNiaStandaloneStore((state) => state.open);
  const origin = useNiaStandaloneStore((state) => state.origin);
  const [tab, setTab] = useState<InspectorTab>("conversations");
  const [memoryContext, setMemoryContext] = useState("");
  const [routingPreference, setRoutingPreference] = useState(loadNiaRoutingPreference);
  const [companion, setCompanion] = useState<CompanionSnapshot>({ state: "resting", muted: false });
  const [companionVisible, setCompanionVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveConversationId, setArchiveConversationId] = useState<string | null>(null);
  const [textPaneOpen, setTextPaneOpen] = useState(false);
  const [textPaneTab, setTextPaneTab] = useState<NiaTextPaneTab>("chat");
  const [accentTheme, setAccentTheme] = useState<NiaAccentTheme>("violet");
  const [voice, setVoice] = useState("ballad");
  const [saveConversations, setSaveConversations] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(NIA_INSPECTOR_DEFAULT_WIDTH);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeGestureRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const memories = useMemo<readonly NiaMemoryRecord[]>(() => {
    if (typeof window === "undefined") return [];
    return loadNiaMemories(window.localStorage);
  }, []);
  const activeMemories = useMemo(() => activeNiaMemories(memories), [memories]);
  const tasks = useNiaTaskStore((state) => state.tasks);
  const hydrateTasks = useNiaTaskStore((state) => state.hydrate);
  const summary = useHomeLearningSummary();
  const activeCard = contextCards.find((card) => card.id === activeContextCardId) ?? null;
  const tools = listNiaToolsForContext(activeCard);
  const persistentContext = memoryContext || formatNiaConfirmedMemoriesForPrompt(activeMemories);
  const reviewCount = summary.review.status === "ready" ? summary.review.actionableCount : 0;
  const companionState = companion.state ?? "resting";

  useEffect(() => {
    hydrateTasks();
    try {
      setVoice(window.localStorage.getItem("auris.nia.voice") || "ballad");
      const storedAccent = window.localStorage.getItem("auris.nia.accent-theme");
      if (storedAccent === "violet" || storedAccent === "gold" || storedAccent === "blue") setAccentTheme(storedAccent);
    } catch { /* in-memory defaults are enough */ }
  }, [hydrateTasks]);

  useEffect(() => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) return;
    void bridge.invoke("snapshot").then((value) => {
      if (!value || typeof value !== "object") return;
      const snapshot = value as CompanionSnapshot;
      setCompanion(snapshot);
      if (typeof snapshot.visible === "boolean") setCompanionVisible(snapshot.visible);
      if (typeof snapshot.savingConversations === "boolean") setSaveConversations(snapshot.savingConversations);
    }).catch(() => undefined);
    const listener = (event: unknown) => {
      if (!event || typeof event !== "object") return;
      const item = event as { type?: string; snapshot?: CompanionSnapshot; report?: { type?: string } };
      if (item.type === "snapshot" && item.snapshot) {
        setCompanion(item.snapshot);
        if (typeof item.snapshot.savingConversations === "boolean") setSaveConversations(item.snapshot.savingConversations);
      }
      if (item.type === "visibility" && typeof (item as { visible?: unknown }).visible === "boolean") setCompanionVisible((item as { visible: boolean }).visible);
      if (item.type === "report" && item.report?.type) setCompanion((current) => ({ ...current, state: item.report?.type === "failed" ? "failed" : item.report?.type === "opened" ? "listening" : current.state }));
    };
    bridge.subscribe(listener);
    return () => { bridge.unsubscribe(listener); };
  }, []);

  useEffect(() => {
    const bridge = getNiaStandaloneBridge(window);
    if (!bridge) return;
    return bridge.subscribeLaunch((nextLaunch) => open(nextLaunch));
  }, [open]);

  const workspaceWidth = useCallback(() => {
    const measured = bodyRef.current?.clientWidth ?? 0;
    return measured > 0 ? measured : window.innerWidth;
  }, []);

  const resizeInspector = useCallback((requestedWidth: number) => {
    setInspectorWidth(constrainNiaInspectorWidth(requestedWidth, workspaceWidth()));
  }, [workspaceWidth]);

  useEffect(() => {
    let storedWidth = NIA_INSPECTOR_DEFAULT_WIDTH;
    try {
      const parsed = Number(window.localStorage.getItem(NIA_INSPECTOR_WIDTH_STORAGE_KEY));
      if (Number.isFinite(parsed) && parsed > 0) storedWidth = parsed;
    } catch { /* The default split remains usable without storage. */ }
    setInspectorWidth(constrainNiaInspectorWidth(storedWidth, workspaceWidth()));
    setLayoutHydrated(true);
  }, [workspaceWidth]);

  useEffect(() => {
    if (!layoutHydrated) return;
    try { window.localStorage.setItem(NIA_INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth)); } catch { /* best effort */ }
  }, [inspectorWidth, layoutHydrated]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const gesture = resizeGestureRef.current;
      if (!gesture) return;
      resizeInspector(gesture.startWidth + gesture.startX - event.clientX);
    };
    const finishResize = () => {
      if (!resizeGestureRef.current) return;
      resizeGestureRef.current = null;
      setIsResizing(false);
    };
    const handleWindowResize = () => {
      if (window.innerWidth <= 820) return;
      setInspectorWidth((current) => constrainNiaInspectorWidth(current, workspaceWidth()));
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [resizeInspector, workspaceWidth]);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    resizeGestureRef.current = { startWidth: inspectorWidth, startX: event.clientX };
    setIsResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowLeft") resizeInspector(inspectorWidth + step);
    else if (event.key === "ArrowRight") resizeInspector(inspectorWidth - step);
    else if (event.key === "Home") resizeInspector(NIA_INSPECTOR_MIN_WIDTH);
    else if (event.key === "End") resizeInspector(NIA_INSPECTOR_MAX_WIDTH);
    else return;
    event.preventDefault();
  };

  const browserContextAvailable = context?.kind === "browser_reference" && Boolean(browserTarget);
  const setSaved = (next: boolean) => {
    setSaveConversations(next);
    void getNiaCompanionHostBridge(window)?.invoke("conversation-saving", { enabled: next });
  };
  const setSelectedVoice = (next: string) => {
    setVoice(next);
    try { window.localStorage.setItem("auris.nia.voice", next); } catch { /* best effort */ }
  };
  const setSelectedAccent = (next: NiaAccentTheme) => {
    setAccentTheme(next);
    try { window.localStorage.setItem("auris.nia.accent-theme", next); } catch { /* best effort */ }
  };
  const openTextPane = (nextTab: NiaTextPaneTab = "chat") => {
    setTextPaneTab(nextTab);
    setTextPaneOpen(true);
  };
  const openArchive = (conversationId?: string) => {
    setArchiveConversationId(conversationId ?? null);
    setArchiveOpen(true);
  };

  return (
    <main className="nia-workspace" data-accent-theme={accentTheme} data-origin={origin} data-status={companionState}>
      <header className="nia-workspace__topbar">
        <div className="nia-workspace__brand"><span className="nia-workspace__brand-mark">N</span><div><strong>Nia</strong><small>你的学习陪伴者</small></div></div>
        <div className="nia-workspace__status" aria-live="polite"><span className="nia-workspace__status-dot" data-active={companionState !== "resting"} />{statusCopy(companionState)}</div>
        <div className="nia-workspace__top-actions"><span className="nia-workspace__review-count">今日复习 {reviewCount} 项</span><button aria-pressed={textPaneOpen} className="nia-workspace__text-button" onClick={() => textPaneOpen ? setTextPaneOpen(false) : openTextPane("chat")} type="button">文字对话</button><button aria-label="Nia 设置" className="nia-workspace__icon-button" onClick={() => setSettingsOpen(true)} type="button">⚙</button></div>
      </header>

      {archiveOpen ? <NiaConversationArchive initialConversationId={archiveConversationId} onClose={() => setArchiveOpen(false)} /> : <div
        className="nia-workspace__body"
        data-resizing={isResizing ? "true" : "false"}
        data-text-pane-open={textPaneOpen}
        ref={bodyRef}
        style={{ "--nia-side-pane-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <section className="nia-workspace__main-column">
          <div className="nia-workspace__hero">
            <NiaAvatar onActivate={() => { const bridge = getNiaCompanionHostBridge(window); void bridge?.invoke(["opening", "listening", "attending", "thinking", "speaking", "working"].includes(companionState) ? "rest" : "wake"); }} state={companionState} />
          </div>
        </section>

        <div
          aria-label="调整两个板块宽度"
          aria-orientation="vertical"
          aria-valuemax={NIA_INSPECTOR_MAX_WIDTH}
          aria-valuemin={NIA_INSPECTOR_MIN_WIDTH}
          aria-valuenow={inspectorWidth}
          className="nia-workspace__resize-handle"
          onDoubleClick={() => resizeInspector(NIA_INSPECTOR_DEFAULT_WIDTH)}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={beginResize}
          role="separator"
          tabIndex={0}
          title="左右拖动调整板块宽度，双击恢复默认"
        ><span /></div>

        {textPaneOpen ? <NiaTextSidePane browserTarget={browserTarget} externalContext={context} externalContextToken={contextToken} onClose={() => setTextPaneOpen(false)} onTabChange={setTextPaneTab} persistentContext={persistentContext} routingPreference={routingPreference} session={textSession} supportedContexts={browserContextAvailable ? ["browser"] : []} tab={textPaneTab} /> : <aside className="nia-workspace__inspector" aria-label="Nia 信息面板">
          <nav className="nia-workspace__tabs" role="tablist" aria-label="Nia 面板"><button aria-selected={tab === "conversations"} onClick={() => setTab("conversations")} role="tab" type="button">会话记录</button><button aria-selected={tab === "memory"} onClick={() => setTab("memory")} role="tab" type="button">记忆</button><button aria-selected={tab === "tasks"} onClick={() => setTab("tasks")} role="tab" type="button">任务</button><button aria-selected={tab === "tools"} onClick={() => setTab("tools")} role="tab" type="button">工具</button></nav>
          {tab === "conversations" ? <NiaConversationPanel onOpenArchive={openArchive} /> : null}
          {tab === "memory" ? <section className="nia-workspace__inspector-content"><div className="nia-workspace__section-title"><span>已确认记忆</span><b>{activeMemories.length}</b></div>{activeMemories.length ? <div className="nia-workspace__memory-list">{activeMemories.map((memory) => <article key={memory.id}><span>{memory.kind === "goal" ? "目标" : memory.kind === "learning_evidence" ? "学习证据" : "偏好"}</span><p>{memory.content}</p></article>)}</div> : <p className="nia-workspace__empty">Nia 还没有长期记忆。<br />在下方工具中提议一条，确认后才会使用。</p>}<NiaOperationsPanel onMemoryContextChange={setMemoryContext} /></section> : null}
          {tab === "tasks" ? <section className="nia-workspace__inspector-content"><div className="nia-workspace__section-title"><span>学习任务</span><b>{tasks.filter((task) => task.status === "running" || task.status === "planned").length} 进行中</b></div><NiaOperationsPanel onMemoryContextChange={setMemoryContext} /></section> : null}
          {tab === "tools" ? <section className="nia-workspace__inspector-content"><div className="nia-workspace__section-title"><span>可用工具</span><b>{tools.filter((tool) => tool.available).length}/{tools.length}</b></div><div className="nia-workspace__tool-list">{tools.map((tool) => <article data-available={tool.available} key={tool.id}><span>{tool.available ? "可用" : "未连接"}</span><strong>{tool.label}</strong><small>{tool.description}</small></article>)}</div><NiaModelRoutingPanel onPreferenceChange={setRoutingPreference} preference={routingPreference} /></section> : null}
        </aside>}
      </div>}

      {settingsOpen ? <div className="nia-workspace__settings-backdrop" role="presentation"><section aria-label="Nia 角色设置" className="nia-workspace__settings" role="dialog"><header><div><span>角色设置 · CHARACTER</span><h2>Nia</h2><p>这些设置会影响 Nia 的陪伴方式。</p></div><button aria-label="关闭设置" onClick={() => setSettingsOpen(false)} type="button">×</button></header><div className="nia-workspace__settings-section"><label>称呼<input defaultValue="Nia" maxLength={40} /></label><div><span>外观</span><div className="nia-workspace__colour-options"><button aria-label="紫色主题" aria-pressed={accentTheme === "violet"} className="nia-workspace__colour nia-workspace__colour--violet" onClick={() => setSelectedAccent("violet")} type="button" /><button aria-label="金色主题" aria-pressed={accentTheme === "gold"} className="nia-workspace__colour nia-workspace__colour--gold" onClick={() => setSelectedAccent("gold")} type="button" /><button aria-label="蓝色主题" aria-pressed={accentTheme === "blue"} className="nia-workspace__colour nia-workspace__colour--blue" onClick={() => setSelectedAccent("blue")} type="button" /></div></div></div><div className="nia-workspace__settings-section"><span>语音</span><div className="nia-workspace__voice-options">{voiceOptions.map((option) => <button aria-pressed={voice === option} key={option} onClick={() => setSelectedVoice(option)} type="button">{option}</button>)}</div><small>点击语音名称可试听（当前实时会话在下一次唤醒时使用）。</small></div><div className="nia-workspace__settings-section nia-workspace__settings-row"><div><strong>显示桌面形象</strong><small>隐藏后可在这里重新显示 Nia。</small></div><button aria-pressed={companionVisible} className="nia-workspace__switch" onClick={() => { const visible = !companionVisible; setCompanionVisible(visible); void getNiaCompanionHostBridge(window)?.invoke("companion-visibility", { visible }); }} type="button"><i /></button></div><div className="nia-workspace__settings-section nia-workspace__settings-row"><div><strong>保存新对话</strong><small>关闭后不会删除已保存的历史。</small></div><button aria-pressed={saveConversations} className="nia-workspace__switch" onClick={() => setSaved(!saveConversations)} type="button"><i /></button></div><div className="nia-workspace__settings-section"><span>提醒时间</span><div className="nia-workspace__reminder-times"><b>09:00</b><b>14:00</b><b>20:00</b></div><small>复习提醒会在桌面上唤醒 Nia；勿扰时段 23:00–07:30。</small></div><div className="nia-workspace__settings-section nia-workspace__settings-section--text-link"><div><strong>文字模型与 API Key</strong><small>在独立侧栏里连接服务商并进行键盘对话，不影响 GPT Live。</small></div><button onClick={() => { setSettingsOpen(false); openTextPane("connection"); }} type="button">打开连接侧栏</button></div><footer><button onClick={() => setSettingsOpen(false)} type="button">完成</button></footer></section></div> : null}
    </main>
  );
}
