/**
 * Auris 首页工作台。
 * 布局状态与内容状态严格分离：所有 Widget 通过统一注册表进入三栏 Workspace，
 * 而任务、笔记、复习与人生记录继续使用各自原有的数据存储。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  CheckIcon,
  FolderIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  Trash2Icon,
} from "@/components/auris-ui/auris-icons";
import { BrowserStatusCenter } from "@/components/desktop/browser-status-center";
import { PersonalOsDashboard } from "@/components/desktop/personal-os-dashboard";
import { CalendarHeatmap } from "@/components/home/calendar-heatmap";
import { DailyQuote } from "@/components/home/daily-quote";
import { LifeRoad } from "@/components/home/life-road";
import { PlanList } from "@/components/home/plan-list";
import { NotesFileTree } from "@/components/notes-v2/notes-file-tree";
import { useNotesDialog } from "@/components/notes-v2/use-notes-dialog";
import { useNotesWorkbench } from "@/components/notes-v2/use-notes-workbench";
import {
  createDefaultHomeData,
  getBrowserHomeStorage,
  HOME_STORAGE_EVENT,
  HOME_STORAGE_KEY,
  readHomeData,
  toLocalDateKey,
  writeHomeData,
  type HomeData,
} from "@/features/home/home-store";
import type { NotePageSummary } from "@/features/notes/note-types";
import { useSystemColorScheme } from "@/features/appearance/use-system-color-scheme";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import { getVaultClient } from "@/platform/notes/get-vault-client";
import { useHomeLearningSummary } from "@/features/home-learning/use-home-learning-summary";
import {
  HomeContinueLearningCard,
  HomeReadingCard,
  HomeReviewCard,
} from "@/components/home/learning/home-learning-cards";
import "./home-demo-workbench.css";
import "./home-v3.css";

type HomePageProps = { onNavigate: (href: string) => void; recentNotes?: NotePageSummary[] };
type ColumnId = "left" | "center" | "right";
type WidgetType =
  | "calendar" | "workspace" | "quote" | "life" | "review" | "capture" | "plans" | "browser"
  | "countdown" | "current-study" | "nia" | "progress" | "recent-files" | "reading" | "pomodoro" | "personal-os"
  | "quick-note" | "habit" | "clock" | "weather" | "music";
type WidgetSize = "small" | "medium" | "large" | "auto";
type WidgetInstance = {
  id: string;
  type: WidgetType;
  zone: ColumnId;
  order: number;
  height: number;
  size: WidgetSize;
  centerSpan: 2 | 3 | 4 | 6;
  pinned: boolean;
  hidden: boolean;
};
type ColumnState = { width: number; collapsed: boolean };
type WorkspaceLayout = { version: 2; columns: Record<ColumnId, ColumnState>; widgets: WidgetInstance[] };
type SavedLayout = { id: string; name: string; system?: false; state: WorkspaceLayout; updatedAt: string };
type DragState = { id: string; x: number; y: number } | null;
type DropTarget = { zone: ColumnId; index: number } | null;
type ResizeMode = "height" | "width" | "ratio";
type WidgetResizeState = { id: string; mode: ResizeMode; startX: number; startY: number; startHeight: number; startSpan: 2 | 3 | 4 | 6 } | null;
type ColumnResizeState = { divider: "left" | "right" } | null;
type WidgetDefinition = { type: WidgetType; name: string; description: string; category: "学习" | "效率" | "Auris" | "信息" | "媒体"; defaultHeight: number; defaultSpan: 2 | 3 | 4 | 6 };
type LayoutBundle = { version: 2; current: WorkspaceLayout; activeLayoutId: string; layouts: SavedLayout[] };

const currentStorageKey = "auris.home.workspace.v2";
const layoutsStorageKey = "auris.home.workspace.layouts.v2";
const activeLayoutStorageKey = "auris.home.workspace.active-layout.v2";
const legacyCurrentStorageKey = "auris.home.demo-workbench.v1";
const legacyLayoutsStorageKey = "auris.home.demo-workbench.layouts.v1";
const initialLayoutId = "initial";
const initialLayoutName = "初始布局";
const columnIds: ColumnId[] = ["left", "center", "right"];

const widgetDefinitions: WidgetDefinition[] = [
  { type: "reading", name: "Reading", description: "当前阅读与阅读队列。", category: "学习", defaultHeight: 220, defaultSpan: 4 },
  { type: "review", name: "今日复习", description: "今日待复习知识点与进度。", category: "学习", defaultHeight: 192, defaultSpan: 2 },
  { type: "current-study", name: "继续学习", description: "文章、视频与学习笔记的真实恢复入口。", category: "学习", defaultHeight: 270, defaultSpan: 2 },
  { type: "personal-os", name: "个人操作系统", description: "以 Markdown 项目库驱动今日主项目、资源入口与学习记录。", category: "学习", defaultHeight: 620, defaultSpan: 6 },
  { type: "progress", name: "学习进度", description: "最近实际打开的 Reading 文章。", category: "学习", defaultHeight: 192, defaultSpan: 2 },
  { type: "calendar", name: "记录日历", description: "最近学习情况热力图。", category: "学习", defaultHeight: 306, defaultSpan: 6 },
  { type: "plans", name: "今日任务", description: "可直接编辑的任务清单。", category: "效率", defaultHeight: 356, defaultSpan: 2 },
  { type: "pomodoro", name: "Pomodoro", description: "专注倒计时入口。", category: "效率", defaultHeight: 176, defaultSpan: 2 },
  { type: "quick-note", name: "Quick Note", description: "一分钟捕捉下一件事。", category: "效率", defaultHeight: 156, defaultSpan: 2 },
  { type: "capture", name: "Quick Capture", description: "把闪念记录为笔记或任务。", category: "效率", defaultHeight: 192, defaultSpan: 2 },
  { type: "habit", name: "Habit Tracker", description: "保持稳定的每日节奏。", category: "效率", defaultHeight: 180, defaultSpan: 2 },
  { type: "workspace", name: "工作区", description: "本地知识库与快速笔记。", category: "Auris", defaultHeight: 252, defaultSpan: 2 },
  { type: "nia", name: "Nia Mini", description: "Auris 的极简学习建议入口。", category: "Auris", defaultHeight: 170, defaultSpan: 2 },
  { type: "recent-files", name: "最近文件", description: "最近打开的 Markdown 与资料。", category: "Auris", defaultHeight: 188, defaultSpan: 2 },
  { type: "quote", name: "每日格言", description: "保留一天的注意力锚点。", category: "信息", defaultHeight: 108, defaultSpan: 3 },
  { type: "countdown", name: "考研 Countdown", description: "克制呈现重要日期。", category: "信息", defaultHeight: 180, defaultSpan: 2 },
  { type: "clock", name: "Clock", description: "当前日期与时间。", category: "信息", defaultHeight: 144, defaultSpan: 2 },
  { type: "weather", name: "Weather", description: "今日环境状态。", category: "信息", defaultHeight: 144, defaultSpan: 2 },
  { type: "life", name: "人生阶段", description: "沿时间路记录正在发生的事。", category: "Auris", defaultHeight: 560, defaultSpan: 6 },
  { type: "browser", name: "浏览器状态", description: "浏览器连接与会话状态。", category: "Auris", defaultHeight: 184, defaultSpan: 2 },
  { type: "music", name: "Music", description: "一段安静的专注声音入口。", category: "媒体", defaultHeight: 152, defaultSpan: 2 },
];
const widgetDefinitionByType = new Map(widgetDefinitions.map((item) => [item.type, item]));
const widgetTypeSet = new Set<WidgetType>(widgetDefinitions.map((item) => item.type));

function makeInitialLayout(): WorkspaceLayout {
  return {
    version: 2,
    columns: {
      left: { width: 24, collapsed: false },
      center: { width: 52, collapsed: false },
      right: { width: 24, collapsed: false },
    },
    widgets: [
      { id: "calendar", type: "calendar", zone: "left", order: 0, height: 306, size: "large", centerSpan: 6, pinned: false, hidden: false },
      { id: "workspace", type: "workspace", zone: "left", order: 1, height: 252, size: "medium", centerSpan: 2, pinned: false, hidden: false },
      { id: "quote", type: "quote", zone: "center", order: 0, height: 108, size: "small", centerSpan: 3, pinned: true, hidden: false },
      { id: "personal-os", type: "personal-os", zone: "center", order: 1, height: 620, size: "large", centerSpan: 6, pinned: false, hidden: false },
      { id: "life", type: "life", zone: "center", order: 2, height: 560, size: "large", centerSpan: 6, pinned: true, hidden: false },
      { id: "review", type: "review", zone: "center", order: 3, height: 192, size: "medium", centerSpan: 3, pinned: false, hidden: false },
      { id: "progress", type: "progress", zone: "center", order: 4, height: 192, size: "medium", centerSpan: 3, pinned: false, hidden: false },
      { id: "capture", type: "capture", zone: "center", order: 5, height: 192, size: "medium", centerSpan: 3, pinned: false, hidden: false },
      { id: "plans", type: "plans", zone: "right", order: 0, height: 356, size: "large", centerSpan: 2, pinned: false, hidden: false },
      { id: "browser", type: "browser", zone: "right", order: 1, height: 184, size: "medium", centerSpan: 2, pinned: true, hidden: false },
      { id: "current-study", type: "current-study", zone: "right", order: 2, height: 270, size: "large", centerSpan: 2, pinned: false, hidden: false },
    ],
  };
}
const initialLayout = makeInitialLayout();

function cloneLayout(value: WorkspaceLayout): WorkspaceLayout { return JSON.parse(JSON.stringify(value)) as WorkspaceLayout; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isColumnId(value: unknown): value is ColumnId { return value === "left" || value === "center" || value === "right"; }
function isWidgetType(value: unknown): value is WidgetType { return typeof value === "string" && widgetTypeSet.has(value as WidgetType); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function normalizeSpan(value: unknown): 2 | 3 | 4 | 6 { return value === 2 || value === 3 || value === 4 || value === 6 ? value : 2; }
function normalizeName(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 48); }
function createId(prefix: string) { return typeof crypto !== "undefined" && "randomUUID" in crypto ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function orderedWidgets(widgets: WidgetInstance[], zone: ColumnId) { return widgets.filter((item) => item.zone === zone).sort((a, b) => a.order - b.order); }
function normalizeOrders(layout: WorkspaceLayout): WorkspaceLayout {
  return { ...layout, widgets: layout.widgets.map((item) => ({ ...item, order: orderedWidgets(layout.widgets, item.zone).findIndex((candidate) => candidate.id === item.id) })) };
}
function normalizeLayout(value: unknown): WorkspaceLayout | null {
  if (!isRecord(value)) return null;
  if (value.version === 2 && Array.isArray(value.widgets) && isRecord(value.columns)) {
    const seen = new Set<string>();
    const widgets: WidgetInstance[] = value.widgets.flatMap((raw) => {
      if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id || seen.has(raw.id) || !isWidgetType(raw.type) || !isColumnId(raw.zone)) return [];
      seen.add(raw.id);
      const definition = widgetDefinitionByType.get(raw.type)!;
      return [{
        id: raw.id,
        type: raw.type,
        zone: raw.zone,
        order: typeof raw.order === "number" && Number.isFinite(raw.order) ? Math.max(0, Math.round(raw.order)) : 0,
        height: typeof raw.height === "number" && Number.isFinite(raw.height) ? clamp(Math.round(raw.height), 108, 680) : definition.defaultHeight,
        size: raw.size === "small" || raw.size === "medium" || raw.size === "large" || raw.size === "auto" ? raw.size : "medium",
        centerSpan: normalizeSpan(raw.centerSpan),
        pinned: raw.pinned === true,
        hidden: raw.hidden === true,
      }];
    });
    const columns = columnIds.reduce((result, id) => {
      const raw = isRecord(value.columns) ? value.columns[id] : null;
      const width = isRecord(raw) && typeof raw.width === "number" && Number.isFinite(raw.width) ? raw.width : initialLayout.columns[id].width;
      result[id] = { width: clamp(width, 14, 72), collapsed: isRecord(raw) && raw.collapsed === true };
      return result;
    }, {} as Record<ColumnId, ColumnState>);
    for (const system of initialLayout.widgets) {
      if (!widgets.some((item) => item.id === system.id)) widgets.push({ ...system, hidden: true });
    }
    return normalizeOrders({ version: 2, columns, widgets });
  }
  // v1 迁移：保留用户已调整的分栏、顺序、高度和固定状态。
  const legacyZones = columnIds.reduce((result, id) => {
    result[id] = Array.isArray(value[id]) ? value[id].filter((item): item is string => typeof item === "string") : [];
    return result;
  }, {} as Record<ColumnId, string[]>);
  if (!legacyZones.left.length && !legacyZones.center.length && !legacyZones.right.length) return null;
  const legacyHeights = isRecord(value.heights) ? value.heights : {};
  const legacyPinned = Array.isArray(value.pinned) ? new Set(value.pinned.filter((item): item is string => typeof item === "string")) : new Set<string>();
  const legacyHidden = Array.isArray(value.hidden) ? new Set(value.hidden.filter((item): item is string => typeof item === "string")) : new Set<string>();
  const widgets = initialLayout.widgets.map((item) => {
    const zone = columnIds.find((id) => legacyZones[id].includes(item.id)) ?? item.zone;
    const order = legacyZones[zone].indexOf(item.id);
    const rawHeight = legacyHeights[item.id];
    return {
      ...item,
      zone,
      order: order < 0 ? item.order : order,
      height: typeof rawHeight === "number" && Number.isFinite(rawHeight) ? clamp(Math.round(rawHeight), 108, 680) : item.height,
      pinned: legacyPinned.has(item.id),
      hidden: legacyHidden.has(item.id),
    };
  });
  return { version: 2, columns: cloneLayout(initialLayout).columns, widgets: normalizeOrders({ version: 2, columns: cloneLayout(initialLayout).columns, widgets }).widgets };
}
function loadCurrentLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return cloneLayout(initialLayout);
  try {
    const current = normalizeLayout(JSON.parse(window.localStorage.getItem(currentStorageKey) ?? "null"));
    if (current) return current;
    const legacy = normalizeLayout(JSON.parse(window.localStorage.getItem(legacyCurrentStorageKey) ?? "null"));
    if (legacy) return legacy;
  } catch { /* 初始布局兜底 */ }
  return cloneLayout(initialLayout);
}
function normalizeSavedLayouts(value: unknown): SavedLayout[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || raw.id === initialLayoutId || ids.has(raw.id)) return [];
    const state = normalizeLayout(raw.state ?? raw.layout);
    const name = normalizeName(raw.name);
    if (!state || !name) return [];
    ids.add(raw.id);
    return [{ id: raw.id, name, state, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString() }];
  });
}
function loadSavedLayouts(): SavedLayout[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = normalizeSavedLayouts(JSON.parse(window.localStorage.getItem(layoutsStorageKey) ?? "[]"));
    if (saved.length || window.localStorage.getItem(layoutsStorageKey)) return saved;
    return normalizeSavedLayouts(JSON.parse(window.localStorage.getItem(legacyLayoutsStorageKey) ?? "[]"));
  } catch { return []; }
}
function loadActiveLayoutId() {
  if (typeof window === "undefined") return initialLayoutId;
  try { return window.localStorage.getItem(activeLayoutStorageKey) ?? initialLayoutId; } catch { return initialLayoutId; }
}
function formatShortDate(now: Date) {
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  return `${weekday} · ${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
}
function createPlanId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function shortTime(now: Date) { return now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }); }

export function HomePage({ onNavigate, recentNotes = [] }: HomePageProps) {
  const storage = useMemo(() => getBrowserHomeStorage(), []);
  const now = useMemo(() => new Date(), []);
  const todayKey = toLocalDateKey(now);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const dropRef = useRef<DropTarget>(null);
  const widgetResizeRef = useRef<WidgetResizeState>(null);
  const columnResizeRef = useRef<ColumnResizeState>(null);
  const layoutImportRef = useRef<HTMLInputElement | null>(null);
  const [homeData, setHomeData] = useState<HomeData>(() => createDefaultHomeData());
  // 首屏必须与 SSR 使用同一份静态布局；浏览器本地布局在水合完成后再读取。
  const [layout, setLayout] = useState<WorkspaceLayout>(() => cloneLayout(initialLayout));
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState(initialLayoutId);
  const [isLayoutHydrated, setIsLayoutHydrated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isLayoutsOpen, setIsLayoutsOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState("");
  const [drag, setDrag] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [widgetResize, setWidgetResize] = useState<WidgetResizeState>(null);
  const [columnResize, setColumnResize] = useState<ColumnResizeState>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingLayoutId, setPendingLayoutId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  const systemColorScheme = useSystemColorScheme();
  const { desktopBridge } = useHydratedDesktopBridge();
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({ promptFn, confirmFn });
  const learningSummary = useHomeLearningSummary();

  useEffect(() => {
    setHomeData(readHomeData(storage));
    setMounted(true);
  }, [storage]);
  useEffect(() => {
    if (!storage) return;
    const refresh = () => setHomeData(readHomeData(storage));
    const onStorage = (event: StorageEvent) => {
      if (event.key === HOME_STORAGE_KEY) refresh();
    };
    window.addEventListener(HOME_STORAGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOME_STORAGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [storage]);
  useEffect(() => {
    const nextSavedLayouts = loadSavedLayouts();
    const requestedActiveLayoutId = loadActiveLayoutId();
    const nextActiveLayoutId =
      requestedActiveLayoutId === initialLayoutId ||
      nextSavedLayouts.some((item) => item.id === requestedActiveLayoutId)
        ? requestedActiveLayoutId
        : initialLayoutId;

    setLayout(loadCurrentLayout());
    setSavedLayouts(nextSavedLayouts);
    setActiveLayoutId(nextActiveLayoutId);
    setIsLayoutHydrated(true);
  }, []);
  useEffect(() => {
    if (!isLayoutHydrated) return;
    window.localStorage.setItem(currentStorageKey, JSON.stringify(layout));
  }, [isLayoutHydrated, layout]);
  useEffect(() => {
    if (!isLayoutHydrated) return;
    window.localStorage.setItem(layoutsStorageKey, JSON.stringify(savedLayouts));
  }, [isLayoutHydrated, savedLayouts]);
  useEffect(() => {
    if (!isLayoutHydrated) return;
    window.localStorage.setItem(activeLayoutStorageKey, activeLayoutId);
  }, [activeLayoutId, isLayoutHydrated]);
  useEffect(() => {
    if (activeLayoutId !== initialLayoutId && !savedLayouts.some((item) => item.id === activeLayoutId)) setActiveLayoutId(initialLayoutId);
  }, [activeLayoutId, savedLayouts]);
  useEffect(() => {
    if (!gridRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(Math.round(entry.contentRect.width)));
    observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, []);

  const persist = useCallback((updater: (current: HomeData) => HomeData) => {
    setHomeData((current) => { const next = updater(current); writeHomeData(storage, next); return next; });
  }, [storage]);
  const updateQuote = useCallback((text: string) => persist((current) => ({ ...current, quote: { date: todayKey, text, updatedAt: new Date().toISOString() } })), [persist, todayKey]);
  const addPlanTasks = useCallback((titles: string[]) => {
    const timestamp = new Date().toISOString();
    const plans = titles.map((title) => ({ id: createPlanId(), title, done: false, createdAt: timestamp, updatedAt: timestamp }));
    persist((current) => ({ ...current, plans: [...current.plans, ...plans] }));
  }, [persist]);
  const updatePlanTitle = useCallback((id: string, title: string) => persist((current) => ({ ...current, plans: current.plans.map((item) => item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item) })), [persist]);
  const togglePlan = useCallback((id: string) => persist((current) => ({ ...current, plans: current.plans.map((item) => item.id === id ? { ...item, done: !item.done, updatedAt: new Date().toISOString() } : item) })), [persist]);
  const deletePlan = useCallback((id: string) => persist((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== id) })), [persist]);
  const recordPlansToLog = useCallback(async () => {
    const client = getVaultClient();
    if (!client) { onNavigate("/notes"); return; }
    const section = homeData.plans.length ? homeData.plans.map((item) => `- [${item.done ? "x" : " "}] ${item.title.trim() || "未命名计划"}`).join("\n") : "_今天没有计划。_";
    const existing = (await client.readFile("任务记录.md")) ?? "# 任务记录\n";
    await client.writeFile("任务记录.md", `${existing.trim()}\n\n## ${todayKey}\n\n${section}\n`);
  }, [homeData.plans, onNavigate, todayKey]);
  const openNote = useCallback((path: string) => onNavigate(`/notes?resumeNoteId=${encodeURIComponent(path)}`), [onNavigate]);
  const quickNote = useCallback(async () => {
    const notes = getNotesStorage();
    if (!notes) { onNavigate("/notes"); return; }
    const page = await notes.createPage({ title: "未命名笔记" }); await notes.savePage(page); openNote(page.id);
  }, [onNavigate, openNote]);

  const isVaultConfigured = mounted && Boolean(workbench.directoryInfo?.isConfigured);
  const availableLayouts = useMemo(() => [{ id: initialLayoutId, name: initialLayoutName, state: initialLayout }, ...savedLayouts], [savedLayouts]);
  const activeLayout = useMemo(() => availableLayouts.find((item) => item.id === activeLayoutId) ?? availableLayouts[0], [activeLayoutId, availableLayouts]);
  const isLayoutDirty = useMemo(() => JSON.stringify(layout) !== JSON.stringify(activeLayout.state), [activeLayout.state, layout]);
  const visibleWidgets = useMemo(() => layout.widgets.filter((item) => !item.hidden), [layout.widgets]);
  const getWidget = useCallback((id: string) => layout.widgets.find((item) => item.id === id) ?? null, [layout.widgets]);

  const applyLayout = useCallback((id: string) => {
    const next = id === initialLayoutId ? initialLayout : savedLayouts.find((item) => item.id === id)?.state;
    if (!next) return;
    setLayout(cloneLayout(next)); setActiveLayoutId(id); setFocusId(null);
    setLayoutNotice(`已切换至 ${id === initialLayoutId ? initialLayoutName : savedLayouts.find((item) => item.id === id)?.name ?? initialLayoutName}`);
  }, [savedLayouts]);
  const requestLayoutSwitch = useCallback((id: string) => {
    if (id === activeLayoutId) { setIsLayoutsOpen(false); return; }
    setIsLayoutsOpen(false);
    if (isLayoutDirty) { setPendingLayoutId(id); return; }
    applyLayout(id);
  }, [activeLayoutId, applyLayout, isLayoutDirty]);
  const saveCurrentAs = useCallback(async (defaultName = "") => {
    const answer = await promptFn("保存布局", defaultName, "布局名称");
    const name = answer ? normalizeName(answer) : "";
    if (!name) return false;
    const existing = savedLayouts.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const saved: SavedLayout = { id: existing?.id ?? createId("layout"), name, state: cloneLayout(layout), updatedAt: new Date().toISOString() };
    setSavedLayouts((items) => existing ? items.map((item) => item.id === existing.id ? saved : item) : [...items, saved]);
    setActiveLayoutId(saved.id); setLayoutNotice(existing ? `已更新 ${name}` : `已保存 ${name}`);
    return true;
  }, [layout, promptFn, savedLayouts]);
  const saveCurrentOver = useCallback(() => {
    if (activeLayoutId === initialLayoutId) { void saveCurrentAs(); return; }
    setSavedLayouts((items) => items.map((item) => item.id === activeLayoutId ? { ...item, state: cloneLayout(layout), updatedAt: new Date().toISOString() } : item));
    setLayoutNotice("已覆盖保存当前布局");
  }, [activeLayoutId, layout, saveCurrentAs]);
  const resolvePendingSwitch = useCallback(async (mode: "save" | "discard") => {
    const nextId = pendingLayoutId; if (!nextId) return;
    if (mode === "save") {
      if (activeLayoutId === initialLayoutId) { const saved = await saveCurrentAs(); if (!saved) return; }
      else saveCurrentOver();
    }
    setPendingLayoutId(null); applyLayout(nextId);
  }, [activeLayoutId, applyLayout, pendingLayoutId, saveCurrentAs, saveCurrentOver]);
  const renameLayout = useCallback(async (id: string) => {
    const target = savedLayouts.find((item) => item.id === id); if (!target) return;
    const answer = await promptFn("重命名布局", target.name, "布局名称"); const name = answer ? normalizeName(answer) : "";
    if (!name || savedLayouts.some((item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    setSavedLayouts((items) => items.map((item) => item.id === id ? { ...item, name, updatedAt: new Date().toISOString() } : item));
  }, [promptFn, savedLayouts]);
  const deleteLayout = useCallback(async (id: string) => {
    const target = savedLayouts.find((item) => item.id === id); if (!target || !(await confirmFn(`删除布局「${target.name}」？这不会删除任何任务、笔记或学习数据。`, "删除"))) return;
    setSavedLayouts((items) => items.filter((item) => item.id !== id));
    if (activeLayoutId === id) { setActiveLayoutId(initialLayoutId); setLayout(cloneLayout(initialLayout)); }
  }, [activeLayoutId, confirmFn, savedLayouts]);
  const resetLayout = useCallback(async () => {
    if (!(await confirmFn("恢复初始布局？这只恢复组件位置、尺寸和工作区宽度，不会删除任何内容。", "恢复"))) return;
    setLayout(cloneLayout(initialLayout)); setActiveLayoutId(initialLayoutId); setLayoutNotice("已恢复初始布局");
  }, [confirmFn]);
  const exportLayouts = useCallback(() => {
    const payload: LayoutBundle = { version: 2, current: cloneLayout(layout), activeLayoutId, layouts: savedLayouts.map((item) => ({ ...item, state: cloneLayout(item.state) })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "auris-workspace-layouts.json"; link.click(); URL.revokeObjectURL(url); setLayoutNotice("布局已导出");
  }, [activeLayoutId, layout, savedLayouts]);
  const importLayouts = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        if (!isRecord(parsed) || parsed.version !== 2) throw new Error("unsupported");
        const current = normalizeLayout(parsed.current); const layouts = normalizeSavedLayouts(parsed.layouts);
        if (!current) throw new Error("invalid");
        const selected = typeof parsed.activeLayoutId === "string" ? parsed.activeLayoutId : initialLayoutId;
        setLayout(current); setSavedLayouts(layouts); setActiveLayoutId(selected === initialLayoutId || layouts.some((item) => item.id === selected) ? selected : initialLayoutId);
        setLayoutNotice(`已导入 ${layouts.length} 个自定义布局`);
      } catch { setLayoutNotice("无法导入该布局文件"); }
    };
    reader.readAsText(file);
  }, []);

  const updateLayout = useCallback((updater: (current: WorkspaceLayout) => WorkspaceLayout) => setLayout((current) => normalizeOrders(updater(current))), []);
  const updateWidget = useCallback((id: string, patch: Partial<WidgetInstance>) => updateLayout((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === id ? { ...item, ...patch } : item) })), [updateLayout]);
  const moveWidget = useCallback((id: string, zone: ColumnId, index?: number) => {
    updateLayout((current) => {
      const widget = current.widgets.find((item) => item.id === id); if (!widget) return current;
      const others = current.widgets.filter((item) => item.id !== id);
      const target = orderedWidgets(others, zone); const at = clamp(index ?? target.length, 0, target.length);
      const next = [...others, { ...widget, zone, hidden: false, order: at }];
      const reordered = columnIds.flatMap((column) => orderedWidgets(next, column).map((item, order) => ({ ...item, order })));
      return { ...current, widgets: reordered };
    });
  }, [updateLayout]);
  const deleteWidget = useCallback(async (id: string) => {
    const widget = getWidget(id);
    if (!widget) return;
    const definition = widgetDefinitionByType.get(widget.type);
    if (!(await confirmFn(`删除组件「${definition?.name ?? "未命名组件"}」？可通过恢复初始布局重新添加默认组件。`, "删除组件"))) return;
    updateLayout((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== id) }));
    setLayoutNotice(`已删除 ${definition?.name ?? "组件"}`);
  }, [confirmFn, getWidget, updateLayout]);
  const addWidget = useCallback((type: WidgetType) => {
    const definition = widgetDefinitionByType.get(type)!;
    updateLayout((current) => ({ ...current, widgets: [...current.widgets, { id: createId(type), type, zone: "center", order: orderedWidgets(current.widgets, "center").length, height: definition.defaultHeight, size: "medium", centerSpan: definition.defaultSpan, pinned: false, hidden: false }] }));
    setIsLibraryOpen(false); setEditMode(true); setLayoutNotice(`已添加 ${definition.name}`);
  }, [updateLayout]);
  const toggleColumn = useCallback((id: ColumnId) => updateLayout((current) => ({ ...current, columns: { ...current.columns, [id]: { ...current.columns[id], collapsed: !current.columns[id].collapsed } } })), [updateLayout]);

  const getDropTarget = useCallback((x: number, y: number): DropTarget => {
    const target = document.elementsFromPoint(x, y);
    const zoneNode = target.map((element) => element.closest<HTMLElement>("[data-workspace-zone]")).find(Boolean);
    const zone = zoneNode?.dataset.workspaceZone;
    if (!isColumnId(zone)) return null;
    const widgetNode = target.map((element) => element.closest<HTMLElement>("[data-widget-id]")).find(Boolean);
    const id = widgetNode?.dataset.widgetId;
    const candidates = orderedWidgets(visibleWidgets.filter((item) => item.id !== dragRef.current?.id), zone);
    if (!id || id === dragRef.current?.id) return { zone, index: candidates.length };
    const index = candidates.findIndex((item) => item.id === id);
    if (index < 0) return { zone, index: candidates.length };
    const rect = widgetNode!.getBoundingClientRect();
    return { zone, index: y > rect.top + rect.height / 2 ? index + 1 : index };
  }, [visibleWidgets]);
  useEffect(() => {
    if (!drag?.id) return;
    const move = (event: PointerEvent) => {
      const next = { id: drag.id, x: event.clientX, y: event.clientY }; const target = getDropTarget(event.clientX, event.clientY);
      dragRef.current = next; dropRef.current = target; setDrag(next); setDropTarget(target);
    };
    const release = () => {
      const active = dragRef.current; const target = dropRef.current;
      if (active && target) moveWidget(active.id, target.zone, target.index);
      dragRef.current = null; dropRef.current = null; setDrag(null); setDropTarget(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", release);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); };
  }, [drag?.id, getDropTarget, moveWidget]);
  useEffect(() => {
    if (!widgetResize) return;
    const move = (event: PointerEvent) => {
      const current = widgetResizeRef.current; if (!current) return;
      const widget = getWidget(current.id); if (!widget) return;
      if (current.mode === "height") updateWidget(current.id, { height: clamp(Math.round(current.startHeight + event.clientY - current.startY), 108, 680), size: "auto" });
      if (current.mode === "width" || current.mode === "ratio") {
        const box = gridRef.current?.getBoundingClientRect(); const delta = event.clientX - current.startX;
        const unit = box ? Math.max(80, box.width * (layout.columns.center.width / 100) / 6) : 110;
        const span = normalizeSpan(clamp(Math.round(current.startSpan + delta / unit), 2, 6));
        const patch: Partial<WidgetInstance> = { centerSpan: span, size: "auto" };
        if (current.mode === "ratio") patch.height = clamp(Math.round(current.startHeight * (span / current.startSpan)), 108, 680);
        updateWidget(current.id, patch);
      }
    };
    const release = () => { widgetResizeRef.current = null; setWidgetResize(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", release);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); };
  }, [getWidget, layout.columns.center.width, updateWidget, widgetResize]);
  useEffect(() => {
    if (!columnResize) return;
    const move = (event: PointerEvent) => {
      const active = columnResizeRef.current; const box = gridRef.current?.getBoundingClientRect(); if (!active || !box) return;
      const ratio = clamp(((event.clientX - box.left) / box.width) * 100, 0, 100);
      updateLayout((current) => {
        const left = current.columns.left.width; const right = current.columns.right.width;
        if (active.divider === "left") {
          const nextLeft = clamp(ratio, 14, Math.min(36, (100 - right) / 2));
          return { ...current, columns: { ...current.columns, left: { ...current.columns.left, width: nextLeft }, center: { ...current.columns.center, width: 100 - nextLeft - right } } };
        }
        const nextRight = clamp(100 - ratio, 14, Math.min(36, (100 - left) / 2));
        return { ...current, columns: { ...current.columns, right: { ...current.columns.right, width: nextRight }, center: { ...current.columns.center, width: 100 - nextRight - left } } };
      });
    };
    const release = () => { columnResizeRef.current = null; setColumnResize(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", release);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); };
  }, [columnResize, updateLayout]);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    const widget = getWidget(id); if (!editMode || !widget) return;
    event.preventDefault(); const state = { id, x: event.clientX, y: event.clientY };
    dragRef.current = state; dropRef.current = { zone: widget.zone, index: widget.order }; setDrag(state); setDropTarget(dropRef.current);
  }
  function beginWidgetResize(event: ReactPointerEvent<HTMLButtonElement>, id: string, mode: ResizeMode) {
    const widget = getWidget(id); if (!editMode || !widget) return;
    event.preventDefault(); event.stopPropagation(); const state: WidgetResizeState = { id, mode, startX: event.clientX, startY: event.clientY, startHeight: widget.height, startSpan: widget.centerSpan };
    widgetResizeRef.current = state; setWidgetResize(state);
  }
  function beginColumnResize(event: ReactPointerEvent<HTMLButtonElement>, divider: "left" | "right") {
    if (!editMode) return; event.preventDefault(); const state: ColumnResizeState = { divider }; columnResizeRef.current = state; setColumnResize(state);
  }
  function reviewBody() {
    return <HomeReviewCard onNavigate={onNavigate} summary={learningSummary.review} />;
  }
  function captureBody() { return <div className="demo-capture"><p>把短暂的念头，留在它消失之前。</p><button onClick={() => onNavigate("/flash")}>Open Flash <ArrowUpRightIcon size={14} /></button></div>; }
  function workspaceBody() {
    return <div className="demo-workspace"><div className="demo-workspace__head"><span><FolderIcon size={15} /> {mounted ? workbench.directoryInfo?.directoryName ?? "Workspace" : "Workspace"}</span><button onClick={() => void workbench.handlePickDirectory()}>切换文件夹</button></div>{isVaultConfigured ? <div aria-label="我的库" className="demo-workspace__tree" role="region"><NotesFileTree activePath={workbench.activePath} collapseAllByDefault entries={workbench.entries} onOpenPath={openNote} onCreateNoteInPath={workbench.handleCreateNoteInPath} onCreateFolderInPath={workbench.handleCreateFolderInPath} onDeletePath={workbench.handleDeletePath} onRenamePath={workbench.handleRenamePath} onMovePath={workbench.handleMovePath} /></div> : <button className="demo-workspace__empty" onClick={() => void workbench.handlePickDirectory()}>选择本地文件夹</button>}<div className="demo-workspace__quick"><button aria-label="快速笔记" onClick={() => void quickNote()}>＋ 快速笔记</button><button onClick={() => onNavigate("/flash")}>快速闪念</button></div></div>;
  }
  function genericContent(widget: WidgetInstance): ReactNode {
    if (widget.type === "countdown") {
      const exam = new Date(now.getFullYear(), 11, 26);
      const days = Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / 86_400_000));
      return <div className="workspace-countdown"><div className="workspace-countdown__eyebrow"><small>考研</small><em>{exam.getFullYear()}.12.26</em></div><div className="workspace-countdown__metric"><strong>{days}</strong><span>DAYS</span></div><p>距离初试还有 <b>{days}</b> 天</p></div>;
    }
    if (widget.type === "personal-os") return <PersonalOsDashboard bridge={desktopBridge} onChooseDirectory={workbench.handlePickDirectory} />;
    if (widget.type === "current-study") return <HomeContinueLearningCard article={learningSummary.continueLearning.article} note={learningSummary.continueLearning.note} onNavigate={onNavigate} video={learningSummary.continueLearning.video} />;
    if (widget.type === "nia") return <div className="workspace-nia"><strong>Nia</strong><p>今天有 {learningSummary.review.actionableCount} 个知识点待复习。</p><button onClick={() => onNavigate("/review")}>开始复习</button><button onClick={() => onNavigate("/nia")}>Ask Nia…</button></div>;
    if (widget.type === "progress") return <HomeReadingCard onNavigate={onNavigate} summary={learningSummary.reading} />;
    if (widget.type === "recent-files") return <div className="workspace-recent">{recentNotes.slice(0, 4).length ? recentNotes.slice(0, 4).map((note) => <button key={note.id} onClick={() => openNote(note.id)}><FolderIcon size={13} /> {note.title || "未命名笔记"}</button>) : <><button onClick={() => onNavigate("/notes")}>Markdown · 我的知识库</button><button onClick={() => onNavigate("/reading")}>Reading · 待读内容</button><button onClick={() => void quickNote()}>Knowledge Card · 快速笔记</button></>}</div>;
    if (widget.type === "reading") return <div className="workspace-reading"><strong>Reading Queue</strong><p>把下一段值得慢读的内容放在这里。</p><button onClick={() => onNavigate("/reading")}>打开阅读队列 <ArrowUpRightIcon size={13} /></button></div>;
    if (widget.type === "pomodoro") return <div className="workspace-pomodoro"><small>专注计时</small><strong>25:00</strong><span>下一段专注，慢一点开始。</span><button onClick={() => onNavigate("/focus")}>开始专注</button></div>;
    if (widget.type === "quick-note") return <div className="workspace-quick-note"><span>记点东西…</span><button onClick={() => void quickNote()}>新建笔记</button></div>;
    if (widget.type === "habit") return <div className="workspace-habit"><strong>今日习惯</strong><span>阅读  ·  复习  ·  运动</span><i><b style={{ width: "66%" }} /></i></div>;
    if (widget.type === "clock") return <div className="workspace-clock"><strong>{shortTime(now)}</strong><span>{formatShortDate(now)}</span></div>;
    if (widget.type === "weather") return <div className="workspace-weather"><strong>晴 · 23°</strong><span>适合整理和慢读。</span></div>;
    if (widget.type === "music") return <div className="workspace-music"><strong>Quiet focus</strong><span>不打扰的声音入口。</span><button>播放</button></div>;
    return null;
  }
  function content(widget: WidgetInstance): ReactNode {
    if (widget.type === "calendar") return <CalendarHeatmap />;
    if (widget.type === "workspace") return workspaceBody();
    if (widget.type === "quote") return <DailyQuote dateLabel={formatShortDate(now)} onChange={updateQuote} quote={homeData.quote} />;
    if (widget.type === "life") return <LifeRoad birthYear={homeData.birthYear} records={homeData.lifeRecords} onUpdateBirthYear={(birthYear) => persist((current) => ({ ...current, birthYear }))} onUpdateRecord={(year, text) => persist((current) => ({ ...current, lifeRecords: [...current.lifeRecords.filter((record) => record.year !== year), { year, text, updatedAt: new Date().toISOString() }].filter((record) => record.text.trim()).sort((a, b) => a.year - b.year) }))} />;
    if (widget.type === "review") return reviewBody();
    if (widget.type === "capture") return captureBody();
    if (widget.type === "plans") return <PlanList items={homeData.plans} onAddTasks={addPlanTasks} onDelete={deletePlan} onExport={() => { void recordPlansToLog(); }} onRecord={() => { void recordPlansToLog(); }} onToggle={togglePlan} onUpdateTitle={updatePlanTitle} />;
    if (widget.type === "browser") return <BrowserStatusCenter bridge={desktopBridge?.browserStatus ?? null} />;
    return genericContent(widget);
  }
  function renderWidget(widget: WidgetInstance) {
    if (widget.hidden) return null;
    const definition = widgetDefinitionByType.get(widget.type)!;
    const stageHeight = widget.type === "life" && widget.zone === "center" ? Math.max(widget.height, 420) : widget.height;
    const stageSpan = widget.type === "life" && widget.zone === "center" ? 6 : widget.zone === "center" ? widget.centerSpan : 6;
    const style = { height: stageHeight, "--widget-span": stageSpan } as CSSProperties;
    return <article aria-label={widget.type === "workspace" ? "工作区" : widget.type === "plans" ? "今日" : undefined} className={`demo-widget demo-widget--${widget.type} ${drag?.id === widget.id ? "is-dragging" : ""} ${widget.pinned ? "is-pinned" : ""}`} data-size={widget.size} data-widget-id={widget.id} key={widget.id} style={style}>
      <header>
        <button className="demo-widget__grip" aria-label={`拖动 ${definition.name}`} onPointerDown={(event) => beginDrag(event, widget.id)} type="button"><ActivityIcon size={14} /></button>
        {widget.type === "workspace" ? <h2 className="demo-widget__title">{definition.name}</h2> : <strong>{definition.name}</strong>}
        {widget.pinned ? <BookmarkIcon aria-label="已固定" size={12} /> : null}
        <div className="demo-widget__actions"><button aria-label="专注查看" onClick={() => setFocusId(widget.id)} type="button"><ArrowUpRightIcon size={13} /></button><button aria-label={`删除组件 ${definition.name}`} className="demo-widget__delete" onClick={() => void deleteWidget(widget.id)} title={`删除 ${definition.name}`} type="button"><Trash2Icon size={13} /></button></div>
      </header>
      <div className="demo-widget__body">{content(widget)}</div>
      {editMode ? <button aria-label={`调整 ${definition.name} 高度`} className="demo-widget__resize demo-widget__resize--height" onPointerDown={(event) => beginWidgetResize(event, widget.id, "height")} type="button" /> : null}
    </article>;
  }
  function renderColumn(id: ColumnId) {
    const column = layout.columns[id]; const widgets = orderedWidgets(visibleWidgets, id); const isCollapsed = column.collapsed;
    return <section className={`demo-column demo-column--${id} ${dropTarget?.zone === id ? "is-drop-zone" : ""} ${isCollapsed ? "is-collapsed" : ""}`} data-workspace-zone={id}>
      <button aria-label={`${isCollapsed ? "展开" : "折叠"}${id === "left" ? "左侧" : id === "center" ? "中间" : "右侧"}工作区`} className="demo-column__collapse" onClick={() => toggleColumn(id)} type="button">{isCollapsed ? "＋" : "−"}</button>
      <div className="demo-column__stack">{widgets.map((widget, index) => <span className="demo-column__item" key={widget.id}>{dropTarget?.zone === id && dropTarget.index === index ? <span className="demo-drop-preview">释放后放置在这里</span> : null}{renderWidget(widget)}</span>)}{dropTarget?.zone === id && dropTarget.index === widgets.length ? <span className="demo-drop-preview">释放后放置在这里</span> : null}{!widgets.length ? <span className="demo-column__empty">将组件拖到这里</span> : null}</div>
    </section>;
  }
  const gridTemplateColumns = `${layout.columns.left.collapsed ? "48px" : `${layout.columns.left.width}fr`} 8px ${layout.columns.center.collapsed ? "56px" : `${layout.columns.center.width}fr`} 8px ${layout.columns.right.collapsed ? "48px" : `${layout.columns.right.width}fr`}`;
  const focusWidget = focusId ? getWidget(focusId) : null;

  return <main className={`auris-demo-home home-v3 ${editMode ? "is-editing" : ""} ${drag ? "is-drag-active" : ""} ${containerWidth < 1040 ? "is-compact" : ""}`} data-system-color-scheme={systemColorScheme}>
    <section className="auris-demo-home__main">
      <header className="auris-demo-home__utility">
        <div className="auris-demo-home__product"><img src="/auris-home-demo/auris-mark.webp" alt="" /><strong>Auris</strong><span>Workspace</span></div>
        <div className="auris-demo-home__utility-actions">
          <span className={`auris-demo-home__saved ${isLayoutDirty ? "is-dirty" : ""}`} title={isLayoutDirty ? "布局有未保存修改" : "布局已保存"} />
          <div className="home-layout-picker"><button aria-expanded={isLayoutsOpen} aria-haspopup="dialog" aria-label={`布局：${activeLayout.name}${isLayoutDirty ? "，已修改" : ""}`} className="home-layout-picker__trigger" onClick={() => setIsLayoutsOpen((value) => !value)} type="button"><span aria-hidden="true" className="home-layout-picker__glyph"><i /><i /><i /><i /></span><span>{activeLayout.name}{isLayoutDirty ? " *" : ""}</span><span aria-hidden="true" className="home-layout-picker__chevron">⌄</span></button>{isLayoutsOpen ? <section aria-label="布局管理" className="home-layout-menu"><h2>布局</h2><div className="home-layout-menu__items"><button aria-current={activeLayoutId === initialLayoutId ? "true" : undefined} onClick={() => requestLayoutSwitch(initialLayoutId)} type="button"><CheckIcon aria-hidden="true" size={17} /><span>{initialLayoutName}</span></button>{savedLayouts.length ? <p className="home-layout-menu__label">我的布局</p> : null}{savedLayouts.map((item) => <div className="home-layout-menu__layout" key={item.id}><button aria-current={item.id === activeLayoutId ? "true" : undefined} onClick={() => requestLayoutSwitch(item.id)} type="button"><CheckIcon aria-hidden="true" size={17} /><span>{item.name}{item.id === activeLayoutId && isLayoutDirty ? " · 已修改" : ""}</span></button><div><button aria-label={`重命名 ${item.name}`} onClick={() => void renameLayout(item.id)} type="button">重命名</button><button aria-label={`覆盖保存 ${item.name}`} onClick={saveCurrentOver} type="button">覆盖</button><button aria-label={`删除 ${item.name}`} onClick={() => void deleteLayout(item.id)} type="button">删除</button></div></div>)}</div><div className="home-layout-menu__divider" /><button className="home-layout-menu__save" onClick={() => { void saveCurrentAs(); }} type="button"><PlusIcon size={18} /> 保存当前布局…</button><div className="home-layout-menu__file-actions"><button onClick={exportLayouts} type="button">导出</button><button onClick={() => layoutImportRef.current?.click()} type="button">导入</button></div>{layoutNotice ? <p className="home-layout-menu__notice" role="status">{layoutNotice}</p> : null}</section> : null}</div>
          <button aria-label="添加" className="auris-demo-home__library-button" onClick={() => setIsLibraryOpen(true)} title="添加" type="button"><PlusIcon aria-hidden="true" size={15} /></button>
          <button aria-label={editMode ? "完成自定义布局" : "自定义布局"} className={editMode ? "is-active" : ""} onClick={() => setEditMode((value) => !value)} title={editMode ? "完成编辑" : "自定义布局"} type="button"><SettingsIcon size={15} /></button>
          <button aria-label="恢复初始布局" onClick={() => void resetLayout()} title="恢复初始布局" type="button"><RotateCcwIcon size={15} /></button>
        </div>
      </header>
      <div className="auris-demo-home__grid" ref={gridRef} style={{ gridTemplateColumns }}>
        {renderColumn("left")}<button aria-label="调整左侧工作区宽度" className={`demo-workspace-divider ${columnResize?.divider === "left" ? "is-active" : ""}`} onPointerDown={(event) => beginColumnResize(event, "left")} type="button" />
        {renderColumn("center")}<button aria-label="调整右侧工作区宽度" className={`demo-workspace-divider ${columnResize?.divider === "right" ? "is-active" : ""}`} onPointerDown={(event) => beginColumnResize(event, "right")} type="button" />
        {renderColumn("right")}
      </div>
    </section>
    {editMode ? <aside className="auris-demo-home__editbar"><span>布局编辑模式</span><span>拖动标题栏把手即可跨区排序；边缘与角落可调整尺寸。</span>{layout.widgets.filter((item) => item.hidden).map((item) => <button key={item.id} onClick={() => updateWidget(item.id, { hidden: false })} type="button"><PlusIcon size={13} /> {widgetDefinitionByType.get(item.type)?.name}</button>)}</aside> : null}
    {drag ? <div className="auris-demo-home__ghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>{widgetDefinitionByType.get(getWidget(drag.id)?.type ?? "calendar")?.name}</div> : null}
    {focusWidget ? <div className="auris-demo-home__focus"><section><header><strong>{widgetDefinitionByType.get(focusWidget.type)?.name}</strong><button onClick={() => setFocusId(null)} type="button">退出专注</button></header><div>{content(focusWidget)}</div></section></div> : null}
    {isLibraryOpen ? <aside aria-label="添加组件" className="workspace-library"><header><div><strong>添加组件</strong><span>新组件会自动注册至统一工作区。</span></div><button aria-label="关闭添加组件" onClick={() => setIsLibraryOpen(false)} type="button">×</button></header><div>{(["学习", "效率", "Auris", "信息", "媒体"] as const).map((category) => <section key={category}><h2>{category}</h2>{widgetDefinitions.filter((item) => item.category === category).map((item) => <button key={item.type} onClick={() => addWidget(item.type)} type="button"><span><ActivityIcon size={15} /><strong>{item.name}</strong><small>{item.description}</small></span><PlusIcon size={16} /></button>)}</section>)}</div></aside> : null}
    {pendingLayoutId ? <div className="workspace-layout-confirm" role="dialog" aria-modal="true"><section><strong>当前布局有未保存的更改</strong><p>切换布局不会更改任何任务、笔记或学习数据。</p><div><button onClick={() => setPendingLayoutId(null)} type="button">取消</button><button onClick={() => void resolvePendingSwitch("discard")} type="button">不保存并切换</button><button className="primary" onClick={() => void resolvePendingSwitch("save")} type="button">保存并切换</button></div></section></div> : null}
    <input accept="application/json" hidden onChange={importLayouts} ref={layoutImportRef} type="file" />
    {renderDialogs()}
  </main>;
}
