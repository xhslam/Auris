/**
 * Auris 首页：以 Demo 9bfcd3d5 的紧凑三栏工作台为视觉与交互基准。
 * 仅编排首页内容；底层笔记、复习、闪念、浏览器与 HomeData 逻辑维持原有实现。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ActivityIcon,
  BookmarkIcon,
  CheckIcon,
  ArrowUpRightIcon,
  FolderIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
} from "@/components/auris-ui/auris-icons";
import { BrowserStatusCenter } from "@/components/desktop/browser-status-center";
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
  readHomeData,
  toLocalDateKey,
  writeHomeData,
  type HomeData,
} from "@/features/home/home-store";
import { getDashboardMetrics, getReviewQueue } from "@/features/output-review/output-review-model";
import { OUTPUT_REVIEW_STORAGE_EVENT, readOutputReviewState } from "@/features/output-review/output-review-storage";
import type { NotePageSummary } from "@/features/notes/note-types";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import { getVaultClient } from "@/platform/notes/get-vault-client";
import "./home-demo-workbench.css";
import "./home-v3.css";

type HomePageProps = { onNavigate: (href: string) => void; recentNotes?: NotePageSummary[] };
type ColumnId = "left" | "center" | "right";
type WidgetId = "calendar" | "workspace" | "quote" | "life" | "review" | "capture" | "plans" | "browser";
type WorkspaceLayout = { left: WidgetId[]; center: WidgetId[]; right: WidgetId[]; hidden: WidgetId[]; heights: Partial<Record<WidgetId, number>>; pinned: WidgetId[] };
type SavedLayout = { id: string; name: string; layout: WorkspaceLayout; updatedAt: string };
type LayoutBundle = { version: 1; current: WorkspaceLayout; selectedLayoutId: string; layouts: SavedLayout[] };
type DragState = { id: WidgetId; x: number; y: number } | null;

const layoutStorageKey = "auris.home.demo-workbench.v1";
const savedLayoutsStorageKey = "auris.home.demo-workbench.layouts.v1";
const activeLayoutStorageKey = "auris.home.demo-workbench.active-layout.v1";
const defaultLayoutId = "default";
const defaultLayoutName = "Default";
const defaultLayout: WorkspaceLayout = {
  left: ["calendar", "workspace"],
  center: ["quote", "life", "review", "capture"],
  right: ["plans", "browser"],
  hidden: [],
  heights: { calendar: 306, workspace: 252, quote: 108, life: 450, review: 192, capture: 192, plans: 356, browser: 184 },
  pinned: ["quote", "life", "browser"],
};
const allWidgetIds: WidgetId[] = ["calendar", "workspace", "quote", "life", "review", "capture", "plans", "browser"];
const widgetLabels: Record<WidgetId, string> = { calendar: "记录日历", workspace: "工作区", quote: "每日格言", life: "人生阶段", review: "今日复习", capture: "快速记录", plans: "今日任务", browser: "浏览器状态" };
const widgetIdSet = new Set<WidgetId>(allWidgetIds);

function cloneLayout(value: WorkspaceLayout) { return JSON.parse(JSON.stringify(value)) as WorkspaceLayout; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isWidgetId(value: unknown): value is WidgetId { return typeof value === "string" && widgetIdSet.has(value as WidgetId); }
function normalizeLayout(value: unknown): WorkspaceLayout | null {
  if (!isRecord(value)) return null;
  const seen = new Set<WidgetId>();
  const take = (key: ColumnId | "hidden") => {
    const source = Array.isArray(value[key]) ? value[key] : [];
    return source.filter((item): item is WidgetId => isWidgetId(item) && !seen.has(item)).filter((item) => { seen.add(item); return true; });
  };
  const left = take("left");
  const center = take("center");
  const right = take("right");
  const hidden = take("hidden");
  for (const column of ["left", "center", "right"] as const) {
    for (const id of defaultLayout[column]) {
      if (!seen.has(id)) { center.push(id); seen.add(id); }
    }
  }
  const heights: Partial<Record<WidgetId, number>> = { ...defaultLayout.heights };
  const savedHeights = isRecord(value.heights) ? value.heights : {};
  for (const id of allWidgetIds) {
    const height = savedHeights[id];
    if (typeof height === "number" && Number.isFinite(height)) heights[id] = Math.min(680, Math.max(108, Math.round(height)));
  }
  const pinned = Array.isArray(value.pinned) ? value.pinned.filter(isWidgetId) : cloneLayout(defaultLayout).pinned;
  return { left, center, right, hidden, heights, pinned: [...new Set(pinned)] };
}
function loadLayout() {
  try {
    const saved = normalizeLayout(JSON.parse(window.localStorage.getItem(layoutStorageKey) ?? "null"));
    if (saved) return saved;
  } catch { /* 使用初始布局 */ }
  return cloneLayout(defaultLayout);
}
function layoutName(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 48); }
function createLayoutId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `layout-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function normalizeSavedLayouts(value: unknown): SavedLayout[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || ids.has(item.id)) return [];
    const layout = normalizeLayout(item.layout);
    const name = layoutName(item.name);
    if (!layout || !name || item.id === defaultLayoutId) return [];
    ids.add(item.id);
    return [{ id: item.id, name, layout, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString() }];
  });
}
function loadSavedLayouts(): SavedLayout[] {
  if (typeof window === "undefined") return [];
  try { return normalizeSavedLayouts(JSON.parse(window.localStorage.getItem(savedLayoutsStorageKey) ?? "[]") as unknown); } catch { return []; }
}
function loadActiveLayoutId() {
  if (typeof window === "undefined") return defaultLayoutId;
  try { return window.localStorage.getItem(activeLayoutStorageKey) ?? defaultLayoutId; } catch { return defaultLayoutId; }
}
function formatShortDate(now: Date) {
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  return `${weekday} · ${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
}
function createPlanId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function HomePage({ onNavigate }: HomePageProps) {
  const storage = useMemo(() => getBrowserHomeStorage(), []);
  const now = useMemo(() => new Date(), []);
  const todayKey = toLocalDateKey(now);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const layoutImportRef = useRef<HTMLInputElement | null>(null);
  const [homeData, setHomeData] = useState<HomeData>(() => createDefaultHomeData());
  const [reviewState, setReviewState] = useState(() => readOutputReviewState(null));
  const [layout, setLayout] = useState<WorkspaceLayout>(loadLayout);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(loadSavedLayouts);
  const [activeLayoutId, setActiveLayoutId] = useState(loadActiveLayoutId);
  const [isLayoutsOpen, setIsLayoutsOpen] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [dropColumn, setDropColumn] = useState<ColumnId | null>(null);
  const [menuId, setMenuId] = useState<WidgetId | null>(null);
  const [focusId, setFocusId] = useState<WidgetId | null>(null);
  const [mounted, setMounted] = useState(false);
  const { desktopBridge } = useHydratedDesktopBridge();
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({ promptFn, confirmFn });

  useEffect(() => {
    setHomeData(readHomeData(storage));
    setReviewState(readOutputReviewState(window.localStorage));
    setMounted(true);
    const syncReview = () => setReviewState(readOutputReviewState(window.localStorage));
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, syncReview);
    window.addEventListener("storage", syncReview);
    return () => { window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, syncReview); window.removeEventListener("storage", syncReview); };
  }, [storage]);
  useEffect(() => { window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout)); }, [layout]);
  useEffect(() => { window.localStorage.setItem(savedLayoutsStorageKey, JSON.stringify(savedLayouts)); }, [savedLayouts]);
  useEffect(() => {
    if (activeLayoutId !== defaultLayoutId && !savedLayouts.some((item) => item.id === activeLayoutId)) setActiveLayoutId(defaultLayoutId);
    window.localStorage.setItem(activeLayoutStorageKey, activeLayoutId);
  }, [activeLayoutId, savedLayouts]);
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const columnNode = document.elementsFromPoint(event.clientX, event.clientY).map((element) => element.closest<HTMLElement>("[data-home-column]")).find(Boolean);
      const column = columnNode?.dataset.homeColumn as ColumnId | undefined;
      const next = { id: drag.id, x: event.clientX, y: event.clientY };
      dragRef.current = next; setDrag(next); setDropColumn(column ?? null);
    };
    const release = () => {
      const current = dragRef.current;
      if (current && dropColumn) {
        setLayout((previous) => {
          if (previous.pinned.includes(current.id)) return previous;
          return { ...previous, left: previous.left.filter((item) => item !== current.id), center: previous.center.filter((item) => item !== current.id), right: previous.right.filter((item) => item !== current.id), [dropColumn]: [...previous[dropColumn].filter((item) => item !== current.id), current.id], hidden: previous.hidden.filter((item) => item !== current.id) };
        });
      }
      dragRef.current = null; setDrag(null); setDropColumn(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", release);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); };
  }, [drag, dropColumn]);

  const persist = useCallback((updater: (current: HomeData) => HomeData) => {
    setHomeData((current) => { const next = updater(current); writeHomeData(storage, next); return next; });
  }, [storage]);
  const updateQuote = useCallback((text: string) => persist((current) => ({ ...current, quote: { date: todayKey, text, updatedAt: new Date().toISOString() } })), [persist, todayKey]);
  const addPlan = useCallback(() => { const timestamp = new Date().toISOString(); const id = createPlanId(); persist((current) => ({ ...current, plans: [...current.plans, { id, title: "", done: false, createdAt: timestamp, updatedAt: timestamp }] })); return id; }, [persist]);
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
  const quickNote = useCallback(async () => { const notes = getNotesStorage(); if (!notes) { onNavigate("/notes"); return; } const page = await notes.createPage({ title: "未命名笔记" }); await notes.savePage(page); openNote(page.id); }, [onNavigate, openNote]);
  const isVaultConfigured = mounted && Boolean(workbench.directoryInfo?.isConfigured);
  const queue = useMemo(() => getReviewQueue(reviewState, todayKey), [reviewState, todayKey]);
  const metrics = useMemo(() => getDashboardMetrics(reviewState, todayKey), [reviewState, todayKey]);
  const availableLayouts = useMemo(() => [{ id: defaultLayoutId, name: defaultLayoutName, layout: defaultLayout }, ...savedLayouts], [savedLayouts]);
  const activeLayoutName = useMemo(() => availableLayouts.find((item) => item.id === activeLayoutId)?.name ?? defaultLayoutName, [activeLayoutId, availableLayouts]);

  const selectLayout = useCallback((id: string) => {
    const next = id === defaultLayoutId ? defaultLayout : savedLayouts.find((item) => item.id === id)?.layout;
    if (!next) return;
    setLayout(cloneLayout(next));
    setActiveLayoutId(id);
    setLayoutNotice(`已切换至 ${id === defaultLayoutId ? defaultLayoutName : savedLayouts.find((item) => item.id === id)?.name ?? defaultLayoutName}`);
    setIsLayoutsOpen(false);
  }, [savedLayouts]);
  const saveCurrentLayout = useCallback(async () => {
    const answer = await promptFn("保存当前布局", "", "为这个布局命名");
    const name = answer ? layoutName(answer) : "";
    if (!name) return;
    const existing = savedLayouts.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const saved: SavedLayout = { id: existing?.id ?? createLayoutId(), name, layout: cloneLayout(layout), updatedAt: new Date().toISOString() };
    setSavedLayouts((items) => existing ? items.map((item) => item.id === existing.id ? saved : item) : [...items, saved]);
    setActiveLayoutId(saved.id);
    setLayoutNotice(existing ? `已更新 ${name}` : `已保存 ${name}`);
  }, [layout, promptFn, savedLayouts]);
  const exportLayouts = useCallback(() => {
    const payload: LayoutBundle = { version: 1, current: cloneLayout(layout), selectedLayoutId: activeLayoutId, layouts: savedLayouts.map((item) => ({ ...item, layout: cloneLayout(item.layout) })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auris-workbench-layouts.json";
    link.click();
    URL.revokeObjectURL(url);
    setLayoutNotice("布局已导出");
  }, [activeLayoutId, layout, savedLayouts]);
  const importLayouts = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        if (!isRecord(parsed) || parsed.version !== 1) throw new Error("unsupported");
        const current = normalizeLayout(parsed.current);
        const layouts = normalizeSavedLayouts(parsed.layouts);
        if (!current) throw new Error("invalid");
        const selectedLayoutId = typeof parsed.selectedLayoutId === "string" ? parsed.selectedLayoutId : defaultLayoutId;
        setSavedLayouts(layouts);
        setLayout(cloneLayout(current));
        setActiveLayoutId(selectedLayoutId === defaultLayoutId || layouts.some((item) => item.id === selectedLayoutId) ? selectedLayoutId : defaultLayoutId);
        setLayoutNotice(`已导入 ${layouts.length} 个已保存布局`);
        setIsLayoutsOpen(true);
      } catch {
        setLayoutNotice("无法导入该布局文件");
      }
    };
    reader.readAsText(file);
  }, []);

  function moveWidget(id: WidgetId, target: ColumnId) {
    if (layout.pinned.includes(id)) return;
    setLayout((current) => ({ ...current, left: current.left.filter((item) => item !== id), center: current.center.filter((item) => item !== id), right: current.right.filter((item) => item !== id), [target]: [...current[target].filter((item) => item !== id), id], hidden: current.hidden.filter((item) => item !== id) }));
  }
  function toggleHidden(id: WidgetId) { setLayout((current) => current.hidden.includes(id) ? { ...current, hidden: current.hidden.filter((item) => item !== id), center: [...current.center, id] } : { ...current, hidden: [...current.hidden, id] }); setMenuId(null); }
  function resetLayout() { setLayout(cloneLayout(defaultLayout)); setActiveLayoutId(defaultLayoutId); setLayoutNotice("已恢复 Default"); setMenuId(null); }
  function setHeight(id: WidgetId, value: number) { setLayout((current) => ({ ...current, heights: { ...current.heights, [id]: value } })); }
  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, id: WidgetId) { if (!editMode || layout.pinned.includes(id)) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const state = { id, x: event.clientX, y: event.clientY }; dragRef.current = state; setDrag(state); }

  function reviewBody() {
    const total = metrics.overdueCount + metrics.dueTodayCount;
    return <div className="demo-review"><div><strong>{total || 0}</strong><span>个知识点</span><small>{metrics.completedToday} 已完成</small><small>{total} 待完成</small></div><i><em style={{ width: `${Math.min(100, metrics.totalActionableToday ? (metrics.completedToday / metrics.totalActionableToday) * 100 : 0)}%` }} /></i><button onClick={() => onNavigate("/review")}>继续复习 <ArrowUpRightIcon size={14} /></button>{queue[0] ? <p>{queue[0].knowledgePoint.title}</p> : null}</div>;
  }
  function captureBody() { return <div className="demo-capture"><p>把短暂的念头，留在它消失之前。</p><button onClick={() => onNavigate("/flash")}>Open Flash <ArrowUpRightIcon size={14} /></button></div>; }
  function workspaceBody() {
    return <div className="demo-workspace">
      <div className="demo-workspace__head"><span><FolderIcon size={15} /> {workbench.directoryInfo?.directoryName ?? "Workspace"}</span><button onClick={() => void workbench.handlePickDirectory()}>切换文件夹</button></div>
      {isVaultConfigured ? <div aria-label="我的库" className="demo-workspace__tree" role="region"><NotesFileTree activePath={workbench.activePath} collapseAllByDefault entries={workbench.entries} onOpenPath={openNote} onCreateNoteInPath={workbench.handleCreateNoteInPath} onCreateFolderInPath={workbench.handleCreateFolderInPath} onDeletePath={workbench.handleDeletePath} onRenamePath={workbench.handleRenamePath} onMovePath={workbench.handleMovePath} /></div> : <button className="demo-workspace__empty" onClick={() => void workbench.handlePickDirectory()}>选择本地文件夹</button>}
      <div className="demo-workspace__quick"><button aria-label="快速笔记" onClick={() => void quickNote()}>＋ 快速笔记</button><button onClick={() => onNavigate("/flash")}>快速闪念</button></div>
    </div>;
  }
  function content(id: WidgetId): ReactNode {
    if (id === "calendar") return <CalendarHeatmap />;
    if (id === "workspace") return workspaceBody();
    if (id === "quote") return <DailyQuote dateLabel={formatShortDate(now)} onChange={updateQuote} quote={homeData.quote} />;
    if (id === "life") return <LifeRoad birthYear={homeData.birthYear} records={homeData.lifeRecords} onUpdateBirthYear={(birthYear) => persist((current) => ({ ...current, birthYear }))} onUpdateRecord={(year, text) => persist((current) => ({ ...current, lifeRecords: [...current.lifeRecords.filter((record) => record.year !== year), { year, text, updatedAt: new Date().toISOString() }].filter((record) => record.text.trim()).sort((a, b) => a.year - b.year) }))} />;
    if (id === "review") return reviewBody();
    if (id === "capture") return captureBody();
    if (id === "plans") return <PlanList items={homeData.plans} onAdd={addPlan} onDelete={deletePlan} onExport={() => { void recordPlansToLog(); }} onRecord={() => { void recordPlansToLog(); }} onToggle={togglePlan} onUpdateTitle={updatePlanTitle} />;
    return <BrowserStatusCenter bridge={desktopBridge?.browserStatus ?? null} />;
  }
  function widget(id: WidgetId, column: ColumnId) {
    if (layout.hidden.includes(id)) return null;
    const isDrop = dropColumn === column && drag?.id !== id;
    return <article aria-label={id === "workspace" ? "工作区" : id === "plans" ? "今日" : undefined} className={`demo-widget demo-widget--${id} ${isDrop ? "is-drop-zone" : ""}`} data-home-widget={id} key={id} style={{ height: layout.heights[id] }}>
      <header><button className="demo-widget__grip" aria-label={`拖动 ${widgetLabels[id]}`} onPointerDown={(event) => beginDrag(event, id)}><ActivityIcon size={14} /></button><>{id === "workspace" ? <h2 className="demo-widget__title">{widgetLabels[id]}</h2> : <strong>{widgetLabels[id]}</strong>}</>{layout.pinned.includes(id) ? <BookmarkIcon size={12} /> : null}<div><button aria-label="专注查看" onClick={() => setFocusId(id)}><ArrowUpRightIcon size={13} /></button><button aria-label="更多操作" onClick={() => setMenuId(menuId === id ? null : id)}><SettingsIcon size={15} /></button></div></header>
      <div className="demo-widget__body">{content(id)}</div>
      {menuId === id ? <div className="demo-widget__menu"><button onClick={() => setHeight(id, 144)}>Small</button><button onClick={() => setHeight(id, 220)}>Medium</button><button onClick={() => setHeight(id, 360)}>Large</button><div /><button onClick={() => moveWidget(id, "left")}>Left</button><button onClick={() => moveWidget(id, "center")}>Center</button><button onClick={() => moveWidget(id, "right")}>Right</button><button className="danger" onClick={() => toggleHidden(id)}>Hide</button></div> : null}
    </article>;
  }
  function column(id: ColumnId) { return <section className={`demo-column demo-column--${id} ${dropColumn === id ? "is-drop" : ""}`} data-home-column={id}>{layout[id].map((widgetId) => widget(widgetId, id))}</section>; }

  return <main className={`auris-demo-home ${editMode ? "is-editing" : ""}`}>
    <section className="auris-demo-home__main">
      <header className="auris-demo-home__utility">
        <div className="auris-demo-home__product"><img src="/auris-home-demo/auris-mark.webp" alt="" /><strong>Auris</strong></div>
        <div className="auris-demo-home__utility-actions">
          <span className="auris-demo-home__saved" title="布局已保存" />
          <div className="home-layout-picker">
            <button
              aria-expanded={isLayoutsOpen}
              aria-haspopup="dialog"
              aria-label={`布局：${activeLayoutName}`}
              className="home-layout-picker__trigger"
              onClick={() => setIsLayoutsOpen((value) => !value)}
              type="button"
            >
              <span aria-hidden="true" className="home-layout-picker__glyph"><i /><i /><i /><i /></span>
              <span>{activeLayoutName}</span>
              <span aria-hidden="true" className="home-layout-picker__chevron">⌄</span>
            </button>
            {isLayoutsOpen ? <section aria-label="布局管理" className="home-layout-menu">
              <h2>Layouts</h2>
              <div className="home-layout-menu__items">
                {availableLayouts.map((item) => <button aria-current={item.id === activeLayoutId ? "true" : undefined} key={item.id} onClick={() => selectLayout(item.id)} type="button">
                  <CheckIcon aria-hidden="true" size={17} />
                  <span>{item.name}</span>
                </button>)}
              </div>
              <div className="home-layout-menu__divider" />
              <button className="home-layout-menu__save" onClick={() => { void saveCurrentLayout(); }} type="button"><PlusIcon size={18} /> 保存当前布局…</button>
              <div className="home-layout-menu__file-actions">
                <button onClick={exportLayouts} type="button">Export</button>
                <button onClick={() => layoutImportRef.current?.click()} type="button">Import</button>
              </div>
              {layoutNotice ? <p className="home-layout-menu__notice" role="status">{layoutNotice}</p> : null}
            </section> : null}
          </div>
          <button onClick={() => setEditMode((value) => !value)} title={editMode ? "完成编辑" : "编辑工作台"} type="button"><SettingsIcon size={15} /></button>
          <button onClick={resetLayout} title="恢复 Default" type="button"><RotateCcwIcon size={15} /></button>
        </div>
      </header>
      <div className="auris-demo-home__grid" ref={gridRef}>{column("left")}{column("center")}{column("right")}</div>
    </section>
    {editMode ? <aside className="auris-demo-home__editbar"><span>Layout mode</span>{allWidgetIds.filter((id) => layout.hidden.includes(id)).map((id) => <button key={id} onClick={() => toggleHidden(id)}><PlusIcon size={13} /> {widgetLabels[id]}</button>)}</aside> : null}
    {drag ? <div className="auris-demo-home__ghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>{widgetLabels[drag.id]}</div> : null}
    {focusId ? <div className="auris-demo-home__focus"><section><header><strong>{widgetLabels[focusId]}</strong><button onClick={() => setFocusId(null)}>Close</button></header><div>{content(focusId)}</div></section></div> : null}
    <input accept="application/json" hidden onChange={importLayouts} ref={layoutImportRef} type="file" />
    {renderDialogs()}
  </main>;
}
