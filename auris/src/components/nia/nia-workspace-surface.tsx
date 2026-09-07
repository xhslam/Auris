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
import { NiaConversationArchive } from "@/components/nia/nia-conversation-archive";
import { NiaTextSidePane, type NiaTextPaneTab } from "@/components/nia/nia-text-side-pane";
import { getNiaStandaloneBridge } from "@/features/nia/nia-standalone-bridge";
import { listNiaToolsForContext } from "@/features/nia/nia-tool-registry";
import { useNiaStandaloneStore } from "@/features/nia/nia-standalone-store";
import {
  getNiaCompanionHostBridge,
  type NiaCompanionConversationDetail as ConversationDetail,
  type NiaCompanionConversationSummary as Conversation,
  type NiaCompanionSearchHit as SearchHit,
  type NiaCompanionToolUse as ToolUse,
} from "@/features/nia/nia-companion-bridge";
import {
  DEFAULT_NIA_COMPANION_SCALE,
  MAX_NIA_COMPANION_SCALE,
  MIN_NIA_COMPANION_SCALE,
  NIA_COMPANION_SCALE_STEP,
  loadNiaCompanionScale,
  saveNiaCompanionScale,
} from "@/features/nia/nia-companion-scale";
import { useHomeLearningSummary } from "@/features/home-learning/use-home-learning-summary";
import { useNiaSession } from "@/features/nia/use-nia-session";
import { isNiaTurnEagerness, type NiaTurnEagerness } from "@/features/nia/nia-realtime-protocol";

type InspectorTab = "conversations" | "tools";
type NiaAccentTheme = "auto" | "amber" | "gold" | "blue";
type CompanionSnapshot = {
  state?: string;
  muted?: boolean;
  visible?: boolean;
  savingConversations?: boolean;
  pendingReminder?: { count?: number } | null;
};

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

function startOfLocalDay(value: string | number) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function monthIndex(value: string | number) {
  const date = new Date(value);
  return date.getFullYear() * 12 + date.getMonth();
}

function fromMonthIndex(value: number) {
  return { year: Math.floor(value / 12), month: value % 12 };
}

function clock(value: string, withSeconds = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

function durationLabel(startedAt: string, endedAt?: string | null) {
  if (endedAt === undefined) return "时长未知";
  if (endedAt === null) return "进行中";
  const span = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(span) || span < 0) return "时长未知";
  const minutes = Math.max(1, Math.round(span / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("zh-CN", { month: "long", year: "numeric" });
}

function dayHeading(value: number) {
  return new Date(value).toLocaleDateString("zh-CN", { day: "numeric", month: "long", weekday: "long" });
}

function daysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({
    day: index + 1,
    value: new Date(year, month, index + 1).getTime(),
  }));
}

function openingLabel(conversation: Conversation) {
  if (conversation.subject?.trim()) return conversation.subject.trim();
  if (conversation.opening?.trim()) return `“${conversation.opening.trim()}”`;
  return "这段对话没有留下可显示的开场语";
}

function uniqueToolSummary(tools: readonly ToolUse[]) {
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ count, name }));
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
  const [routingPreference, setRoutingPreference] = useState(loadNiaRoutingPreference);
  const [companion, setCompanion] = useState<CompanionSnapshot>({ state: "resting", muted: false });
  const [companionVisible, setCompanionVisible] = useState(true);
  const [companionScale, setCompanionScale] = useState(DEFAULT_NIA_COMPANION_SCALE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveConversationId, setArchiveConversationId] = useState<string | null>(null);
  const [textPaneOpen, setTextPaneOpen] = useState(false);
  const [textPaneTab, setTextPaneTab] = useState<NiaTextPaneTab>("chat");
  const [accentTheme, setAccentTheme] = useState<NiaAccentTheme>("auto");
  const [voice, setVoice] = useState("ballad");
  const [saveConversations, setSaveConversations] = useState(true);
  const [interruptible, setInterruptible] = useState(true);
  const [eagerness, setEagerness] = useState<NiaTurnEagerness>("auto");
  const [inspectorWidth, setInspectorWidth] = useState(NIA_INSPECTOR_DEFAULT_WIDTH);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeGestureRef = useRef<{ startWidth: number; startX: number } | null>(null);

  // Mochi conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchReady, setSearchReady] = useState(false);
  const [detail, setDetail] = useState<ConversationDetail>({ tools: [], turns: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const detailRequest = useRef(0);

  const summary = useHomeLearningSummary();
  const activeCard = contextCards.find((card) => card.id === activeContextCardId) ?? null;
  const tools = listNiaToolsForContext(activeCard);
  const reviewCount = summary.review.status === "ready" ? summary.review.actionableCount : 0;
  const companionState = companion.state ?? "resting";

  const loadConversationDetail = useCallback((conversationId: string) => {
    const bridge = typeof window === "undefined" ? null : getNiaCompanionHostBridge(window);
    if (!bridge) return;
    const request = detailRequest.current + 1;
    detailRequest.current = request;
    setDetailLoading(true);
    void bridge.invoke("conversation-detail", { conversationId }).then((value) => {
      if (detailRequest.current !== request) return;
      const next = value && typeof value === "object" ? value as Partial<ConversationDetail> : {};
      setDetail({
        tools: Array.isArray(next.tools) ? next.tools : [],
        turns: Array.isArray(next.turns) ? next.turns : [],
      });
    }).catch(() => {
      if (detailRequest.current === request) setDetail({ tools: [], turns: [] });
    }).finally(() => {
      if (detailRequest.current === request) setDetailLoading(false);
    });
  }, []);

  useEffect(() => {
    try {
      setVoice(window.localStorage.getItem("auris.nia.voice") || "ballad");
      setCompanionScale(loadNiaCompanionScale());
      const storedAccent = window.localStorage.getItem("auris.nia.accent-theme");
      if (storedAccent === "violet") {
        setAccentTheme("auto");
        try { window.localStorage.setItem("auris.nia.accent-theme", "auto"); } catch { /* best effort */ }
      } else if (storedAccent === "auto" || storedAccent === "amber" || storedAccent === "gold" || storedAccent === "blue") {
        setAccentTheme(storedAccent);
      }
      const storedInterruptible = window.localStorage.getItem("auris.nia.interruptible");
      if (storedInterruptible !== null) setInterruptible(storedInterruptible !== "false");
      const storedEagerness = window.localStorage.getItem("auris.nia.eagerness");
      if (isNiaTurnEagerness(storedEagerness)) setEagerness(storedEagerness);
    } catch { /* in-memory defaults are enough */ }
  }, []);

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

    let active = true;
    void bridge.invoke("conversations").then((value) => {
      if (!active) return;
      const next = Array.isArray(value) ? (value as Conversation[]) : [];
      setConversations(next);
      if (next.length > 0) {
        const today = startOfLocalDay(Date.now());
        const todayHasConversation = next.some((item) => startOfLocalDay(item.startedAt) === today);
        const openingDay = todayHasConversation ? today : startOfLocalDay(next[0].startedAt);
        setSelectedDay(openingDay);
        const openingDate = new Date(openingDay);
        setMonth({ year: openingDate.getFullYear(), month: openingDate.getMonth() });

        const firstInDay = next.find((item) => startOfLocalDay(item.startedAt) === openingDay) ?? next[0];
        setSelectedConversation(firstInDay);
        loadConversationDetail(firstInDay.id);
      }
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
    return () => {
      active = false;
      bridge.unsubscribe(listener);
    };
  }, [loadConversationDetail]);

  useEffect(() => {
    const bridge = getNiaStandaloneBridge(window);
    if (!bridge) return;
    return bridge.subscribeLaunch((nextLaunch) => open(nextLaunch));
  }, [open]);

  useEffect(() => {
    const bridge = typeof window === "undefined" ? null : getNiaCompanionHostBridge(window);
    const term = query.trim();
    setSearchReady(false);
    if (!term || !bridge) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void bridge.invoke("conversation-search", { query: term }).then((value) => {
        setHits(Array.isArray(value) ? value : []);
        setSearchReady(true);
      }).catch(() => {
        setHits([]);
        setSearchReady(true);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

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
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const gesture = resizeGestureRef.current;
      if (!gesture) return;
      resizeInspector(gesture.startWidth + event.clientX - gesture.startX);
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
    if (event.key === "ArrowLeft") resizeInspector(inspectorWidth - step);
    else if (event.key === "ArrowRight") resizeInspector(inspectorWidth + step);
    else if (event.key === "Home") resizeInspector(NIA_INSPECTOR_MIN_WIDTH);
    else if (event.key === "End") resizeInspector(NIA_INSPECTOR_MAX_WIDTH);
    else return;
    event.preventDefault();
  };

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const conversation of conversations) {
      const day = startOfLocalDay(conversation.startedAt);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [conversations]);

  const months = useMemo(() => (
    [...new Set(conversations.map((item) => monthIndex(item.startedAt)))].sort((a, b) => a - b)
  ), [conversations]);
  const currentMonthIndex = month.year * 12 + month.month;
  const previousMonth = [...months].reverse().find((value) => value < currentMonthIndex) ?? null;
  const nextMonth = months.find((value) => value > currentMonthIndex) ?? null;
  const visibleConversations = useMemo(() => (
    conversations.filter((item) => selectedDay !== null && startOfLocalDay(item.startedAt) === selectedDay)
  ), [conversations, selectedDay]);
  const toolSummary = useMemo(() => uniqueToolSummary(detail.tools), [detail.tools]);
  const availableToolCount = tools.filter((tool) => tool.available).length;
  const interruptions = detail.turns.filter((turn) => turn.speaker === "nia" && Boolean(turn.cut)).length;

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    loadConversationDetail(conversation.id);
  };

  const handleSelectDay = (dayValue: number) => {
    setSelectedDay(dayValue);
    const dayConvs = conversations.filter((item) => startOfLocalDay(item.startedAt) === dayValue);
    if (dayConvs.length > 0) {
      setSelectedConversation(dayConvs[0]);
      loadConversationDetail(dayConvs[0].id);
    } else {
      setSelectedConversation(null);
      setDetail({ tools: [], turns: [] });
    }
  };

  const handleSelectHit = (hit: SearchHit) => {
    const found = conversations.find((item) => item.id === hit.conversationId) ?? {
      id: hit.conversationId,
      opening: hit.text,
      startedAt: hit.startedAt,
      subject: hit.subject ?? null,
    };
    const day = startOfLocalDay(hit.startedAt);
    const date = new Date(day);
    setSelectedDay(day);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedConversation(found);
    loadConversationDetail(found.id);
  };

  const copyFullConversation = () => {
    if (!detail.turns.length) return;
    const text = detail.turns
      .map((t) => `${t.speaker === "user" ? "我" : "Nia"}: ${t.text || ""}`)
      .join("\n\n");
    void navigator.clipboard?.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
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
  const setSelectedCompanionScale = (next: number) => {
    setCompanionScale(saveNiaCompanionScale(next));
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

  const toggleWakeRest = () => {
    const bridge = getNiaCompanionHostBridge(window);
    const active = ["opening", "listening", "attending", "thinking", "speaking", "working"].includes(companionState);
    void bridge?.invoke(active ? "rest" : "wake");
  };

  return (
    <main className="nia-workspace" data-accent-theme={accentTheme} data-origin={origin} data-status={companionState}>
      <header className="nia-workspace__topbar">
        <div className="nia-workspace__brand">
          <button
            aria-label={companionState !== "resting" ? "让 Nia 休息" : "唤醒 Nia"}
            className="nia-workspace__brand-mark"
            data-active={companionState !== "resting"}
            onClick={toggleWakeRest}
            type="button"
          >
            N
          </button>
          <div>
            <strong>Nia</strong>
            <small>你的学习陪伴者</small>
          </div>
        </div>

        <div className="nia-workspace__center-controls">
          <button
            aria-label={companionState !== "resting" ? "让 Nia 休息" : "唤醒 Nia"}
            className="nia-workspace__status"
            onClick={toggleWakeRest}
            type="button"
          >
            <span className="nia-workspace__status-dot" data-active={companionState !== "resting"} />
            {statusCopy(companionState)}
          </button>
        </div>

        <div className="nia-workspace__top-actions">
          {tab === "conversations" && (
            <label className="nia-workspace__search-pill">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="搜索全部对话"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索全部对话…"
                type="search"
                value={query}
              />
              {query && (
                <button
                  aria-label="清除搜索"
                  className="nia-workspace__search-clear"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  ×
                </button>
              )}
            </label>
          )}
          <span className="nia-workspace__review-count">今日复习 {reviewCount} 项</span>
          <button
            aria-pressed={textPaneOpen}
            className="nia-workspace__text-button"
            onClick={() => textPaneOpen ? setTextPaneOpen(false) : openTextPane("chat")}
            type="button"
          >
            文字对话
          </button>
          <button
            aria-label="Nia 设置"
            className="nia-workspace__icon-button"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            ⚙
          </button>
        </div>
      </header>

      {archiveOpen ? (
        <NiaConversationArchive initialConversationId={archiveConversationId} onClose={() => setArchiveOpen(false)} />
      ) : (
        <div
          className="nia-workspace__body"
          data-resizing={isResizing ? "true" : "false"}
          data-text-pane-open={textPaneOpen}
          ref={bodyRef}
          style={{ "--nia-side-pane-width": `${inspectorWidth}px` } as CSSProperties}
        >
          {/* Right: primary transcript reading stage or tool catalogue. */}
          <section className="nia-workspace__main-column">
            {tab === "conversations" && (
              selectedConversation ? (
                <article className="nia-workspace__reading-stage" aria-label="会话详情">
                  <header className="nia-workspace__transcript-head">
                    <div className="nia-workspace__transcript-title-wrap">
                      <span className="nia-workspace__transcript-badge">REALTIME 陪伴记录</span>
                      <h2>{openingLabel(selectedConversation)}</h2>
                      <div className="nia-workspace__transcript-meta">
                        <span className="nia-workspace__meta-clock">{clock(selectedConversation.startedAt)}</span>
                        <span className="nia-workspace__meta-sep">·</span>
                        <span>{detail.turns.length || selectedConversation.turnCount || 0} 轮对话</span>
                        <span className="nia-workspace__meta-sep">·</span>
                        <span>时长 {durationLabel(selectedConversation.startedAt, selectedConversation.endedAt)}</span>
                        <span className="nia-workspace__meta-sep">·</span>
                        <span className={interruptions ? "nia-workspace__cut-tag" : "nia-workspace__done-tag"}>
                          {interruptions ? `${interruptions} 次被打断` : "完整结束"}
                        </span>
                      </div>
                    </div>
                    <div className="nia-workspace__transcript-actions">
                      {detail.turns.length > 0 && (
                        <button
                          className="nia-workspace__action-pill"
                          onClick={copyFullConversation}
                          type="button"
                        >
                          {copiedAll ? "已复制全文" : "复制全文"}
                        </button>
                      )}
                    </div>
                    {toolSummary.length > 0 && (
                      <div className="nia-workspace__transcript-tools">
                        {toolSummary.map((tool) => (
                          <i key={tool.name}>{tool.name}{tool.count > 1 ? ` ×${tool.count}` : ""}</i>
                        ))}
                      </div>
                    )}
                  </header>

                  {detailLoading ? (
                    <div className="nia-workspace__transcript-loading">
                      <p>正在读取会话内容…</p>
                    </div>
                  ) : detail.turns.length === 0 ? (
                    <p className="nia-workspace__empty">这段会话没有留下可显示的文字内容。</p>
                  ) : (
                    <div className="nia-workspace__turns">
                      {detail.turns.map((turn) => (
                        <div
                          className={`nia-workspace__turn nia-workspace__turn--${turn.speaker}`}
                          key={turn.id}
                        >
                          {turn.speaker === "nia" && (
                            <span className="nia-workspace__turn-avatar" aria-hidden="true">
                              <i /><i />
                            </span>
                          )}
                          <div className="nia-workspace__turn-bubble">
                            <p>{turn.text || "（内容在结束前被截断）"}</p>
                            {turn.speaker !== "user" && (
                              <small>
                                {turn.cut && <b className="nia-workspace__turn-cut">被打断</b>}
                                <span>{clock(turn.at, true)}</span>
                                <button
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(turn.text);
                                    setCopiedTurnId(turn.id);
                                    setTimeout(() => setCopiedTurnId(null), 2000);
                                  }}
                                  type="button"
                                >
                                  {copiedTurnId === turn.id ? "已复制" : "复制"}
                                </button>
                              </small>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ) : (
                <div className="nia-workspace__reading-empty">
                  <span className="nia-workspace__mini-avatar" aria-hidden="true"><i /><i /></span>
                  <h3>从左侧选择一段会话</h3>
                  <p>按日期浏览与检索本机保存的真实语音会话记录；或者在上方搜索全部对话。</p>
                  <div className="nia-workspace__empty-status">
                    <span className="nia-workspace__status-dot" data-active={companionState !== "resting"} />
                    <span>Nia 当前状态：{statusCopy(companionState)}</span>
                  </div>
                </div>
              )
            )}

            {tab === "tools" && (
              <article className="nia-workspace__tools-stage" aria-label="可用工具与模型路由">
                <header className="nia-workspace__transcript-head">
                  <div className="nia-workspace__transcript-title-wrap">
                    <span className="nia-workspace__transcript-badge">CAPABILITIES</span>
                    <h2>可用工具与能力权限</h2>
                    <p className="nia-workspace__stage-intro">Nia 在学习陪伴与复习提醒中可安全调用的系统能力与操作授权。</p>
                  </div>
                  <div className="nia-workspace__capability-count" aria-label={`${availableToolCount} 个工具已连接`}>
                    <strong>{availableToolCount}</strong>
                    <span>/ {tools.length} 已连接</span>
                  </div>
                </header>
                <div className="nia-workspace__tools-scroll">
                  <div className="nia-workspace__tools-grid">
                    {tools.map((tool, index) => (
                      <article
                        className="nia-workspace__tool-card"
                        data-available={tool.available}
                        key={tool.id}
                        style={{ "--nia-tool-order": index } as CSSProperties}
                      >
                        <div className="nia-workspace__tool-card-head">
                          <span className="nia-workspace__tool-index">{String(index + 1).padStart(2, "0")}</span>
                          <span className="nia-workspace__tool-card-pill">{tool.available ? "可用" : "未连接"}</span>
                        </div>
                        <strong>{tool.label}</strong>
                        <p>{tool.description}</p>
                        <code>{tool.id}</code>
                      </article>
                    ))}
                  </div>
                </div>
              </article>
            )}
          </section>

          {/* Resizable Divider */}
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
            title="左右拖动调整左侧资料栏宽度，双击恢复默认"
          >
            <span />
          </div>

          {/* Left: conversation/tool inspector, or the typed-chat side pane. */}
          {textPaneOpen ? (
            <NiaTextSidePane
              browserTarget={browserTarget}
              externalContext={context}
              externalContextToken={contextToken}
              onClose={() => setTextPaneOpen(false)}
              onTabChange={setTextPaneTab}
              persistentContext=""
              routingPreference={routingPreference}
              session={textSession}
              supportedContexts={browserContextAvailable ? ["browser"] : []}
              tab={textPaneTab}
            />
          ) : (
            <aside className="nia-workspace__inspector" aria-label="Nia 信息面板">
              <nav className="nia-workspace__tabs" role="tablist" aria-label="Nia 面板">
                <button
                  aria-selected={tab === "conversations"}
                  onClick={() => setTab("conversations")}
                  role="tab"
                  type="button"
                >
                  会话记录
                </button>
                <button
                  aria-selected={tab === "tools"}
                  onClick={() => setTab("tools")}
                  role="tab"
                  type="button"
                >
                  工具
                </button>
              </nav>

              {tab === "conversations" && (
                <section className="nia-workspace__inspector-content nia-workspace__inspector-conversations">
                  {/* Mochi Daystrip Calendar */}
                  <div className="nia-workspace__calendar">
                    <div className="nia-workspace__month-nav">
                      <button
                        aria-label="上一个有对话的月份"
                        disabled={previousMonth === null}
                        onClick={() => previousMonth !== null && setMonth(fromMonthIndex(previousMonth))}
                        type="button"
                      >
                        ‹
                      </button>
                      <strong>{monthLabel(month.year, month.month)}</strong>
                      <button
                        aria-label="下一个有对话的月份"
                        disabled={nextMonth === null}
                        onClick={() => nextMonth !== null && setMonth(fromMonthIndex(nextMonth))}
                        type="button"
                      >
                        ›
                      </button>
                    </div>
                    <div
                      className="nia-workspace__days"
                      role="list"
                      style={{ "--nia-archive-days": daysInMonth(month.year, month.month).length } as CSSProperties}
                    >
                      {daysInMonth(month.year, month.month).map((day) => {
                        const count = dayCounts.get(day.value) ?? 0;
                        return (
                          <button
                            aria-current={day.value === selectedDay ? "date" : undefined}
                            aria-label={`${month.month + 1}月${day.day}日，${count} 次对话`}
                            disabled={count === 0}
                            key={day.value}
                            onClick={() => handleSelectDay(day.value)}
                            role="listitem"
                            type="button"
                          >
                            <span>{day.day}</span>
                            {count > 0 ? <i /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section Title */}
                  <div className="nia-workspace__section-title">
                    <span>{query.trim() ? "搜索结果" : selectedDay !== null ? dayHeading(selectedDay) : "最近会话"}</span>
                    <b>{query.trim() ? hits.length : visibleConversations.length}</b>
                  </div>

                  {/* Conversation List */}
                  <div className="nia-workspace__conversation-scroll">
                    {query.trim() ? (
                      searchReady && hits.length === 0 ? (
                        <p className="nia-workspace__empty">没有找到匹配的内容。</p>
                      ) : (
                        <ul aria-label="搜索结果" className="nia-workspace__conversation-list">
                          {hits.map((hit) => (
                            <li key={hit.turnId}>
                              <button
                                aria-current={selectedConversation?.id === hit.conversationId}
                                className="nia-workspace__conversation-row"
                                onClick={() => handleSelectHit(hit)}
                                type="button"
                              >
                                <span className="nia-workspace__conversation-marker" aria-hidden="true" />
                                <span className="nia-workspace__conversation-copy">
                                  <strong>{hit.subject?.trim() || hit.text}</strong>
                                  <small>{clock(hit.at)} · {hit.speaker === "user" ? "你" : "Nia"}</small>
                                </span>
                                <i aria-hidden="true">›</i>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : visibleConversations.length === 0 ? (
                      <p className="nia-workspace__empty">当天没有保存的会话记录。</p>
                    ) : (
                      <ul aria-label="会话列表" className="nia-workspace__conversation-list">
                        {visibleConversations.map((conversation) => (
                          <li key={conversation.id}>
                            <button
                              aria-current={selectedConversation?.id === conversation.id}
                              className="nia-workspace__conversation-row"
                              onClick={() => handleSelectConversation(conversation)}
                              type="button"
                            >
                              <span className="nia-workspace__conversation-marker" aria-hidden="true" />
                              <span className="nia-workspace__conversation-copy">
                                <strong>{openingLabel(conversation)}</strong>
                                <small>{clock(conversation.startedAt)} · ◌ {conversation.turnCount ?? 0} 轮 · ◷ {durationLabel(conversation.startedAt, conversation.endedAt)}</small>
                              </span>
                              <i aria-hidden="true">›</i>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    className="nia-workspace__conversation-all"
                    onClick={() => openArchive(selectedConversation?.id)}
                    type="button"
                  >
                    <span><strong>查看完整归档</strong><small>全屏日历与 SQLite 导出</small></span>
                    <i aria-hidden="true">›</i>
                  </button>
                </section>
              )}

              {tab === "tools" && (
                <section className="nia-workspace__inspector-content nia-workspace__capability-inspector" aria-label="工具连接概览">
                  <div className="nia-workspace__section-title">
                    <span>连接概览</span>
                    <b>LIVE</b>
                  </div>
                  <div className="nia-workspace__capability-stats">
                    <article>
                      <strong>{availableToolCount}</strong>
                      <span>已连接</span>
                    </article>
                    <article>
                      <strong>{tools.length - availableToolCount}</strong>
                      <span>等待上下文</span>
                    </article>
                  </div>
                  <div className="nia-workspace__context-note">
                    <span>当前上下文</span>
                    <strong>{activeCard ? activeCard.title : "独立陪伴模式"}</strong>
                    <p>{activeCard ? "只会使用已明确附加到当前会话的内容。" : "从笔记、阅读、视频或浏览器发起 Nia，对应能力才会开放。"}</p>
                  </div>
                  <NiaModelRoutingPanel onPreferenceChange={setRoutingPreference} preference={routingPreference} />
                </section>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen ? (
        <div
          className="nia-workspace__settings-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
          role="presentation"
        >
          <section aria-label="Nia 角色设置" aria-modal="true" className="nia-workspace__settings" role="dialog">
            <header>
              <div>
                <span>角色设置 · CHARACTER</span>
                <h2>Nia</h2>
                <p>这些设置会影响 Nia 的陪伴方式与桌面表现。</p>
              </div>
              <button aria-label="关闭设置" onClick={() => setSettingsOpen(false)} type="button">×</button>
            </header>
            <div className="nia-workspace__settings-body">
              <div className="nia-workspace__settings-section">
                <label>称呼<input defaultValue="Nia" maxLength={40} /></label>
                <div>
                  <span>外观</span>
                  <div className="nia-workspace__colour-options">
                    <button
                      aria-label="跟随主题"
                      aria-pressed={accentTheme === "auto"}
                      className="nia-workspace__colour nia-workspace__colour--auto"
                      onClick={() => setSelectedAccent("auto")}
                      type="button"
                    />
                    <button
                      aria-label="暖橙主题"
                      aria-pressed={accentTheme === "amber"}
                      className="nia-workspace__colour nia-workspace__colour--amber"
                      onClick={() => setSelectedAccent("amber")}
                      type="button"
                    />
                    <button
                      aria-label="金色主题"
                      aria-pressed={accentTheme === "gold"}
                      className="nia-workspace__colour nia-workspace__colour--gold"
                      onClick={() => setSelectedAccent("gold")}
                      type="button"
                    />
                    <button
                      aria-label="蓝色主题"
                      aria-pressed={accentTheme === "blue"}
                      className="nia-workspace__colour nia-workspace__colour--blue"
                      onClick={() => setSelectedAccent("blue")}
                      type="button"
                    />
                  </div>
                </div>
              </div>
              <div className="nia-workspace__settings-section nia-workspace__scale-section">
                <div className="nia-workspace__scale-heading">
                  <span>桌面形象大小</span>
                  <output aria-live="polite">{companionScale}%</output>
                </div>
                <div className="nia-workspace__scale-controls">
                  <input
                    aria-label="桌面形象大小"
                    max={MAX_NIA_COMPANION_SCALE}
                    min={MIN_NIA_COMPANION_SCALE}
                    onChange={(event) => setSelectedCompanionScale(Number(event.target.value))}
                    step={NIA_COMPANION_SCALE_STEP}
                    type="range"
                    value={companionScale}
                  />
                  <button
                    disabled={companionScale === DEFAULT_NIA_COMPANION_SCALE}
                    onClick={() => setSelectedCompanionScale(DEFAULT_NIA_COMPANION_SCALE)}
                    type="button"
                  >
                    使用她的原始大小
                  </button>
                </div>
                <small>只调整桌面悬浮玩偶，不会缩放 Nia 窗口或其他界面。</small>
              </div>
              <div className="nia-workspace__settings-section">
                <span>语音</span>
                <div className="nia-workspace__voice-options">
                  {voiceOptions.map((option) => (
                    <button
                      aria-pressed={voice === option}
                      key={option}
                      onClick={() => setSelectedVoice(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <small>点击语音名称可试听（当前实时会话在下一次唤醒时使用）。</small>
              </div>
              <div className="nia-workspace__settings-section nia-workspace__settings-row">
                <div>
                  <strong>显示桌面形象</strong>
                  <small>隐藏后可在这里重新显示 Nia。</small>
                </div>
                <button
                  aria-label="显示桌面形象"
                  aria-pressed={companionVisible}
                  className="nia-workspace__switch"
                  onClick={() => {
                    const visible = !companionVisible;
                    setCompanionVisible(visible);
                    void getNiaCompanionHostBridge(window)?.invoke("companion-visibility", { visible });
                  }}
                  type="button"
                >
                  <i />
                </button>
              </div>
              <div className="nia-workspace__settings-section nia-workspace__settings-row">
                <div>
                  <strong>保存新对话</strong>
                  <small>关闭后不会删除已保存的历史。</small>
                </div>
                <button
                  aria-label="保存新对话"
                  aria-pressed={saveConversations}
                  className="nia-workspace__switch"
                  onClick={() => setSaved(!saveConversations)}
                  type="button"
                >
                  <i />
                </button>
              </div>
              <div className="nia-workspace__settings-section nia-workspace__settings-row">
                <div>
                  <strong>允许中途打断</strong>
                  <small>
                    {interruptible
                      ? "任何声音都会在句子中途打断她。"
                      : "坚持讲完当前句子，他人闲聊不会打断；自己的插话也会暂时被忽略。"}
                  </small>
                </div>
                <button
                  aria-label="允许中途打断"
                  aria-pressed={interruptible}
                  className="nia-workspace__switch"
                  onClick={() => {
                    const next = !interruptible;
                    setInterruptible(next);
                    try {
                      window.localStorage.setItem("auris.nia.interruptible", String(next));
                    } catch { /* storage optional */ }
                  }}
                  type="button"
                >
                  <i />
                </button>
              </div>
              <div className="nia-workspace__settings-section">
                <span>回答前等待时长</span>
                <div className="nia-workspace__eagerness-options">
                  {(
                    [
                      { id: "auto", label: "自动决定", hint: "自适应平衡" },
                      { id: "low", label: "等待更久", hint: "最多8秒 · 嘈杂环境" },
                      { id: "medium", label: "标准", hint: "最多4秒" },
                      { id: "high", label: "较快响应", hint: "最多2秒 · 安静桌面" },
                    ] as const
                  ).map((option) => (
                    <button
                      aria-pressed={eagerness === option.id}
                      key={option.id}
                      onClick={() => {
                        setEagerness(option.id);
                        try {
                          window.localStorage.setItem("auris.nia.eagerness", option.id);
                        } catch { /* storage optional */ }
                      }}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
                <small>控制判定你说完话的等待门限（在下一次唤醒时生效）。</small>
              </div>
              <div className="nia-workspace__settings-section">
                <span>提醒时间</span>
                <div className="nia-workspace__reminder-times">
                  <b>09:00</b><b>14:00</b><b>20:00</b>
                </div>
                <small>复习提醒会在桌面上唤醒 Nia；勿扰时段 23:00–07:30。</small>
              </div>
              <div className="nia-workspace__settings-section nia-workspace__settings-section--text-link">
                <div>
                  <strong>文字模型与 API Key</strong>
                  <small>在独立侧栏里连接服务商并进行键盘对话，不影响 GPT Live。</small>
                </div>
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    openTextPane("connection");
                  }}
                  type="button"
                >
                  打开连接侧栏
                </button>
              </div>
            </div>
            <footer>
              <button onClick={() => setSettingsOpen(false)} type="button">完成</button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
