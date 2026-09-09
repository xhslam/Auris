"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRightIcon, CalendarDaysIcon, CheckIcon, ChevronRightIcon,
  FolderIcon, HistoryIcon, PlusIcon, RotateCcwIcon, SearchIcon, SunIcon, Trash2Icon,
} from "@/components/auris-ui/auris-icons";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { ReviewWheelWorkspace } from "./review-wheel-workspace";
import {
  KnowledgePointRow, OutputReviewCard, ReviewProgress, formatReviewDate, statusLabel,
} from "@/components/review/output-review-card";
import {
  EMPTY_OUTPUT_REVIEW_STATE, STAGE_LABELS,
  completeCurrentReview, createKnowledgePoint, createProject, currentCycleFor,
  deleteKnowledgePoint, getDashboardMetrics, getProjectStats,
  getReviewQueue, refreshReviewStatuses, restartReviewCycle, setKnowledgePointStatus,
  toLocalDateKey, updateKnowledgePoint,
  type CreateKnowledgePointInput, type KnowledgePoint, type KnowledgePointStatus,
  type OutputReviewProject, type OutputReviewState, type ReviewDifficulty,
  type ReviewEvent, type ReviewQueueItem,
} from "@/features/output-review/output-review-model";
import { readOutputReviewState, writeOutputReviewState } from "@/features/output-review/output-review-storage";
import "@/components/review/output-review-page.css";

type ReviewView = "today" | "all" | "projects" | "calendar";
type ConfirmAction =
  | { kind: "complete"; knowledgePointId: string }
  | { kind: "restart" | "master" | "archive" | "delete"; knowledgePointId: string };

const VIEW_LABELS: Record<ReviewView, string> = {
  today: "今天", all: "全部", projects: "项目", calendar: "日历",
};
const dateLongFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
});
const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

function cloneEmptyState(): OutputReviewState {
  return { ...EMPTY_OUTPUT_REVIEW_STATE, projects: [], knowledgePoints: [], cycles: [] };
}

export function ReviewPageClient({
  initialIntent = null,
  initialKnowledgePointId = null,
}: {
  initialIntent?: "create-knowledge-point" | null;
  initialKnowledgePointId?: string | null;
}) {
  const today = toLocalDateKey(new Date());
  const [state, setState] = useState<OutputReviewState>(cloneEmptyState);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ReviewView>("today");
  const [formPoint, setFormPoint] = useState<KnowledgePoint | "new" | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [notice, setNotice] = useState("");
  const [hasHandledCreateIntent, setHasHandledCreateIntent] = useState(false);
  const [hasHandledKnowledgePointIntent, setHasHandledKnowledgePointIntent] = useState(false);
  const [continueKnowledgePointAfterProject, setContinueKnowledgePointAfterProject] = useState(false);

  useEffect(() => {
    setState(refreshReviewStatuses(readOutputReviewState(window.localStorage), today));
    setHydrated(true);
  }, [today]);

  useEffect(() => {
    if (
      initialIntent !== "create-knowledge-point" ||
      !hydrated ||
      hasHandledCreateIntent
    ) return;
    setHasHandledCreateIntent(true);
    if (state.projects.length > 0) {
      setFormPoint("new");
      return;
    }
    setView("projects");
    setContinueKnowledgePointAfterProject(true);
    setProjectFormOpen(true);
  }, [hasHandledCreateIntent, hydrated, initialIntent, state.projects.length]);

  useEffect(() => {
    if (!hydrated || hasHandledKnowledgePointIntent || !initialKnowledgePointId) return;
    setHasHandledKnowledgePointIntent(true);
    if (state.knowledgePoints.some((point) => point.id === initialKnowledgePointId)) {
      setView("today");
      setDetailId(initialKnowledgePointId);
    }
  }, [hasHandledKnowledgePointIntent, hydrated, initialKnowledgePointId, state.knowledgePoints]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const commit = useCallback((updater: (current: OutputReviewState) => OutputReviewState) => {
    setState((current) => {
      const next = updater(current);
      writeOutputReviewState(window.localStorage, next);
      return next;
    });
  }, []);

  const queue = useMemo(() => getReviewQueue(state, today), [state, today]);
  const metrics = useMemo(() => getDashboardMetrics(state, today), [state, today]);
  const detailPoint = state.knowledgePoints.find((point) => point.id === detailId);

  const handleConfirm = () => {
    if (!confirmAction) return;
    const point = state.knowledgePoints.find((item) => item.id === confirmAction.knowledgePointId);
    if (!point) return;
    if (confirmAction.kind === "complete") {
      const wasDay7 = point.currentStage === "day7";
      commit((current) => completeCurrentReview(current, point.id));
      setNotice(wasDay7 ? "Day 7 已完成，知识点已标记为掌握。" : "输出复习已完成，后续计划已更新。");
    } else if (confirmAction.kind === "restart") {
      commit((current) => restartReviewCycle(current, point.id));
      setNotice("已开始新的 1/2/4/7 周期，旧周期保留在历史中。");
    } else if (confirmAction.kind === "master") {
      commit((current) => setKnowledgePointStatus(current, point.id, "master"));
      setNotice("知识点已手动标记为掌握。");
    } else if (confirmAction.kind === "archive") {
      commit((current) => setKnowledgePointStatus(current, point.id, "archive"));
      setDetailId(null);
      setNotice("知识点已归档，历史仍然保留。");
    } else {
      commit((current) => deleteKnowledgePoint(current, point.id));
      setDetailId(null);
      setNotice("知识点及其复习周期已永久删除。");
    }
    setConfirmAction(null);
  };

  return (
    <DesktopAppFrame activeNavId="review" activeWorkspace="home" subtitle="Review" title="输出复习">
      <main className="auris-page auris-review output-review-page">
        <div className="output-review-page__container">
          <div className="output-review-navigation">
            <nav aria-label="输出复习视图" className="output-review-tabs">
              {(Object.keys(VIEW_LABELS) as ReviewView[]).map((item) => (
                <button aria-current={view === item ? "page" : undefined} data-active={view === item} key={item} onClick={() => setView(item)} type="button">
                  {VIEW_LABELS[item]}
                  {item === "today" && metrics.overdueCount > 0 ? <span aria-label={`${metrics.overdueCount} 项逾期`}>{metrics.overdueCount}</span> : null}
                </button>
              ))}
            </nav>
            <button className="output-review-primary output-review-add" onClick={() => setFormPoint("new")} type="button"><PlusIcon size={15} /><span>添加知识点</span></button>
          </div>

          {!hydrated ? <div className="output-review-loading" role="status">正在读取本地复习计划…</div>
            : view === "today" ? <ReviewWheelWorkspace state={state} queue={queue} onOpen={setDetailId} onAddProject={() => setProjectFormOpen(true)}><TodayView metrics={metrics} onAdd={() => setFormPoint("new")} onComplete={(knowledgePointId) => setConfirmAction({ kind: "complete", knowledgePointId })} onOpen={setDetailId} onShowAll={() => setView("all")} queue={queue} /></ReviewWheelWorkspace>
              : view === "all" ? <AllView onOpen={setDetailId} state={state} />
                : view === "projects" ? <ProjectsView onAddProject={() => setProjectFormOpen(true)} onOpen={setDetailId} state={state} />
                  : <CalendarView onOpen={setDetailId} state={state} today={today} />}
        </div>

        {formPoint ? <KnowledgePointForm
          initial={formPoint === "new" ? undefined : formPoint}
          startDateLocked={formPoint !== "new" && Boolean(currentCycleFor(state, formPoint.id)?.events.some((event) => event.status === "completed"))}
          onCancel={() => setFormPoint(null)}
          onSave={(input) => {
            if (formPoint === "new") {
              commit((current) => createKnowledgePoint(current, input));
              setNotice("1/2/4/7 输出复习周期已创建。");
            } else {
              commit((current) => updateKnowledgePoint(current, formPoint.id, input));
              setNotice("知识点信息已更新。");
            }
            setFormPoint(null);
          }} projects={state.projects} /> : null}
        {projectFormOpen ? <ProjectForm onCancel={() => {
          setProjectFormOpen(false);
          setContinueKnowledgePointAfterProject(false);
        }} onSave={(name, description) => {
          commit((current) => createProject(current, { name, description }));
          setProjectFormOpen(false);
          setNotice("项目已创建。");
          if (continueKnowledgePointAfterProject) {
            setContinueKnowledgePointAfterProject(false);
            setFormPoint("new");
          }
        }} /> : null}
        {detailPoint ? <KnowledgeDetail
          cycles={state.cycles.filter((cycle) => cycle.knowledgePointId === detailPoint.id)}
          onAction={(kind) => setConfirmAction({ kind, knowledgePointId: detailPoint.id })}
          onClose={() => setDetailId(null)} onEdit={() => setFormPoint(detailPoint)}
          onPauseResume={() => {
            const action = detailPoint.status === "paused" ? "resume" : "pause";
            commit((current) => setKnowledgePointStatus(current, detailPoint.id, action));
            setNotice(action === "pause" ? "复习周期已暂停。" : "复习周期已从今天恢复。");
          }} point={detailPoint} project={state.projects.find((project) => project.id === detailPoint.projectId)} /> : null}
        {confirmAction ? <ConfirmationDialog action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={handleConfirm} /> : null}
        {notice ? <div className="output-review-toast" role="status"><CheckIcon size={16} />{notice}</div> : null}
      </main>
    </DesktopAppFrame>
  );
}

function TodayView({ queue, metrics, onAdd, onComplete, onOpen, onShowAll }: {
  queue: ReviewQueueItem[]; metrics: ReturnType<typeof getDashboardMetrics>;
  onAdd: () => void; onComplete: (knowledgePointId: string) => void; onOpen: (knowledgePointId: string) => void; onShowAll: () => void;
}) {
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const featured = queue[0];
  const progress = metrics.totalActionableToday ? Math.round((metrics.completedToday / metrics.totalActionableToday) * 100) : 100;
  return (
    <div className="output-review-today">
      <section className="output-review-overview" aria-label="今日复盘概览">
        <div className="output-review-summary" aria-label="今日复习数据">
          <div><span>今日执行</span><strong>{metrics.completedToday} / {metrics.totalActionableToday}</strong><small>完成输出</small></div>
          <div><span>逾期</span><strong data-warning={metrics.overdueCount > 0}>{metrics.overdueCount}</strong><small>需要优先处理</small></div>
          <div><span>今天到期</span><strong>{metrics.dueTodayCount}</strong><small>尚未完成</small></div>
          <div className="output-review-summary__progress"><span><span>执行进度</span><b>{progress}%</b></span><div aria-label={`今日执行进度 ${progress}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div></div>
        </div>
      </section>
      {featured ? <details aria-label="接下来复习预览" className="output-review-upcoming" onToggle={(event) => setUpcomingOpen(event.currentTarget.open)} open={upcomingOpen}>
        <summary><span className="output-review-upcoming__title"><span className="output-review-upcoming__icon"><CalendarDaysIcon size={17} /></span><strong>优先处理</strong><i>· 复习预览</i></span><span className="output-review-upcoming__count">{queue.length} 项计划</span></summary>
        <div className="output-review-workbench"><OutputReviewCard item={featured} onComplete={onComplete} onOpen={onOpen} /></div>
        <button className="output-review-followups__all" onClick={onShowAll} type="button">查看全部计划 <ArrowUpRightIcon size={14} /></button>
        <p className="output-review-upcoming__tip"><SunIcon size={14} />建议在安静环境中复习，先回忆，再校验。</p>
      </details> : <EmptyReviewState onAdd={onAdd} />}
    </div>
  );
}

function EmptyReviewState({ onAdd }: { onAdd: () => void }) {
  return <section className="output-review-empty"><HistoryIcon size={32} /><h2>还没有复习周期</h2><p>学完并完成第一次讲解后，添加知识点，1/2/4/7 计划会自动开始。</p><button className="output-review-primary" onClick={onAdd} type="button"><PlusIcon size={17} />添加知识点</button></section>;
}

function AllView({ state, onOpen }: { state: OutputReviewState; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<KnowledgePointStatus | "all">("all");
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const points = state.knowledgePoints.filter((point) => {
    if (filter !== "all" && point.status !== filter) return false;
    const project = state.projects.find((item) => item.id === point.projectId);
    const haystack = [point.title, point.description, project?.name, ...point.tags].filter(Boolean).join(" ").toLocaleLowerCase();
    return !normalizedSearch || haystack.includes(normalizedSearch);
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return (
    <section className="output-review-view output-review-view--all" aria-label="全部知识点">
      <div className="output-review-view__heading">
        <div>
          <h2>全部知识点</h2>
          <p>搜索并检查所有周期，包括已掌握和归档项目。</p>
        </div>
        <span className="output-review-view__badge">{points.length} 项</span>
      </div>
      <div className="output-review-toolbar">
        <label className="output-review-search">
          <SearchIcon size={16} />
          <span className="sr-only">搜索知识点</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题、描述、项目或标签"
          />
        </label>
        <div className="output-review-filter" aria-label="状态筛选">
          {(["all", "active", "overdue", "mastered", "paused", "archived"] as const).map((status) => (
            <button
              data-active={filter === status}
              key={status}
              onClick={() => setFilter(status)}
              type="button"
            >
              {status === "all" ? "全部" : statusLabel(status)}
            </button>
          ))}
        </div>
      </div>
      <div className="output-review-list">
        {points.map((point) => {
          const project = state.projects.find((item) => item.id === point.projectId);
          return project ? (
            <KnowledgePointRow
              cycle={currentCycleFor(state, point.id)}
              key={point.id}
              onOpen={onOpen}
              point={point}
              project={project}
            />
          ) : null;
        })}
        {!points.length ? (
          <div className="output-review-list__empty">没有符合当前条件的知识点。</div>
        ) : null}
      </div>
    </section>
  );
}

function ProjectsView({ state, onAddProject, onOpen }: { state: OutputReviewState; onAddProject: () => void; onOpen: (id: string) => void }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selected = state.projects.find((project) => project.id === selectedProjectId);
  if (selected) {
    const points = state.knowledgePoints.filter((point) => point.projectId === selected.id && point.status !== "archived");
    const stats = getProjectStats(state, selected.id);
    const tags = Array.from(new Set(points.flatMap((point) => point.tags)));
    return (
      <section className="output-review-view output-review-view--project-detail" aria-label={`项目详情：${selected.name}`}>
        <div className="output-review-project-detail__header">
          <button className="output-review-back" onClick={() => setSelectedProjectId(null)} type="button">
            ← 返回项目
          </button>
          <div className="output-review-view__heading">
            <div>
              <h2>{selected.name}</h2>
              <p>{selected.description || "这个项目还没有描述。"}</p>
            </div>
            <div className="output-review-project-detail__rate">
              <span>掌握进度</span>
              <strong>{Math.round(stats.progress * 100)}%</strong>
            </div>
          </div>
        </div>
        <div className="output-review-project-metrics">
          <span><b>{stats.mastered}</b> 已掌握</span>
          <span><b>{stats.active}</b> 进行中</span>
          <span data-warning={stats.overdue > 0}><b>{stats.overdue}</b> 逾期</span>
          <span><b>{stats.paused}</b> 暂停</span>
        </div>
        {tags.length ? (
          <div className="output-review-tags">
            {tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}
        <div className="output-review-list">
          {points.map((point) => (
            <KnowledgePointRow
              cycle={currentCycleFor(state, point.id)}
              key={point.id}
              onOpen={onOpen}
              point={point}
              project={selected}
            />
          ))}
          {!points.length ? (
            <div className="output-review-list__empty">该项目下暂无知识点。</div>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className="output-review-view output-review-view--projects" aria-label="项目列表">
      <div className="output-review-view__heading">
        <div>
          <h2>项目</h2>
          <p>按学习语境查看执行、逾期和掌握情况。</p>
        </div>
        <button className="output-review-secondary" onClick={onAddProject} type="button">
          <PlusIcon size={16} />新建项目
        </button>
      </div>
      <div className="output-review-project-grid">
        {state.projects.map((project) => {
          const stats = getProjectStats(state, project.id);
          return (
            <button
              className="output-review-project-card"
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              type="button"
            >
              <div className="output-review-project-card__head">
                <span className="output-review-project-card__icon"><FolderIcon size={18} /></span>
                <ChevronRightIcon className="output-review-project-card__chevron" size={17} />
              </div>
              <strong>{project.name}</strong>
              <p>{project.description || "暂无描述"}</p>
              <div className="output-review-project-card__stats">
                <span>{stats.mastered} 已掌握</span>
                <span>{stats.active} 进行中</span>
                <span data-warning={stats.overdue > 0}>{stats.overdue} 逾期</span>
              </div>
              <footer>
                <span><i style={{ width: `${stats.progress * 100}%` }} /></span>
                <small>{stats.mastered} / {stats.total} 已掌握</small>
              </footer>
            </button>
          );
        })}
        {!state.projects.length ? (
          <div className="output-review-project-empty">
            <FolderIcon size={26} />
            <p>先创建一个项目，再把知识点放入对应学习语境。</p>
            <button className="output-review-primary" onClick={onAddProject} type="button">
              创建项目
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CalendarView({ state, today, onOpen }: { state: OutputReviewState; today: string; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => { const value = new Date(); return new Date(value.getFullYear(), value.getMonth(), 1, 12); });
  const [selectedDate, setSelectedDate] = useState(today);
  const entries = useMemo(() => state.cycles.filter((cycle) => cycle.isCurrent).flatMap((cycle) => cycle.events.map((event) => ({ event, point: state.knowledgePoints.find((point) => point.id === cycle.knowledgePointId) })).filter((entry) => entry.point && entry.point.status !== "archived" && entry.event.status !== "skipped")), [state]);
  const counts = entries.reduce<Record<string, number>>((result, entry) => { result[entry.event.currentPlannedDate] = (result[entry.event.currentPlannedDate] ?? 0) + 1; return result; }, {});
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12); first.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return date; });
  const selectedEntries = entries.filter((entry) => entry.event.currentPlannedDate === selectedDate);
  return (
    <section className="output-review-view output-review-view--calendar" aria-label="日历视图">
      <div className="output-review-calendar-workspace">
        <div className="output-review-calendar-pane">
          <div className="output-review-calendar-header">
            <div>
              <h2>{month.getFullYear()} 年 {month.getMonth() + 1} 月</h2>
              <p>显示当前调整后的计划。</p>
            </div>
            <div className="output-review-calendar-controls">
              <button aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))} type="button">←</button>
              <button onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelectedDate(today); }} type="button">今天</button>
              <button aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))} type="button">→</button>
            </div>
          </div>
          <div className="output-review-calendar">
            {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => (
              <span className="output-review-calendar__weekday" key={weekday}>{weekday}</span>
            ))}
            {days.map((date) => {
              const key = toLocalDateKey(date);
              const count = counts[key] ?? 0;
              return (
                <button
                  aria-label={`${key}${count ? `，${count} 项复习` : "，没有复习"}`}
                  data-current-month={date.getMonth() === month.getMonth()}
                  data-selected={selectedDate === key}
                  data-today={today === key}
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  type="button"
                >
                  <span>{date.getDate()}</span>
                  {count ? <b>{count}</b> : null}
                </button>
              );
            })}
          </div>
        </div>

        <section className="output-review-calendar-day" aria-label="选定日期复习安排">
          <div className="output-review-calendar-day__header">
            <h3>{dateLongFormatter.format(dateFromKey(selectedDate))}</h3>
            <span>{selectedEntries.length} 项</span>
          </div>
          <div className="output-review-calendar-day__content">
            {selectedEntries.length ? (
              <div className="output-review-calendar-day__list">
                {selectedEntries.map(({ point, event }) => point ? (
                  <button key={event.id} onClick={() => onOpen(point.id)} type="button">
                    <span>
                      <b>{STAGE_LABELS[event.stage]}</b>
                      <strong>{point.title}</strong>
                    </span>
                    <small>
                      {event.status === "completed" ? "已完成" : event.currentPlannedDate < today ? "已逾期" : "待完成"}
                      <ChevronRightIcon size={15} />
                    </small>
                  </button>
                ) : null)}
              </div>
            ) : (
              <p>这一天没有安排输出复习。</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function KnowledgePointForm({ projects, initial, startDateLocked = false, onCancel, onSave }: { projects: OutputReviewProject[]; initial?: KnowledgePoint; startDateLocked?: boolean; onCancel: () => void; onSave: (input: CreateKnowledgePointInput) => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? toLocalDateKey(new Date()));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [materialUrl, setMaterialUrl] = useState(initial?.materialUrl ?? "");
  const [reviewReason, setReviewReason] = useState(initial?.reviewReason ?? "");
  const [difficulty, setDifficulty] = useState<ReviewDifficulty>(initial?.difficulty ?? "medium");
  const [tags, setTags] = useState(initial?.tags.join(" ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showDetails, setShowDetails] = useState(Boolean(initial));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !projectId) return; onSave({ title, projectId, startDate, description, materialUrl, reviewReason, difficulty, tags: [tags], notes }); };
  return <div className="output-review-overlay" role="presentation"><form aria-label={initial ? "编辑知识点" : "添加知识点"} className="output-review-modal output-review-form" onSubmit={submit}><div className="output-review-modal__header"><div><span>{initial ? "EDIT KNOWLEDGE" : "QUICK ADD"}</span><h2>{initial ? "编辑知识点" : "开始 1/2/4/7 复习"}</h2></div><button aria-label="关闭" onClick={onCancel} type="button">×</button></div><label><span>标题 <b>必填</b></span><input autoFocus maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="例如：特征值与特征向量" required value={title} /></label>{projects.length ? <label><span>项目 <b>必填</b></span><select onChange={(event) => setProjectId(event.target.value)} required value={projectId}><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : <label><span>项目 <b>请先创建项目</b></span><input disabled placeholder="请关闭后在“项目”视图创建" /></label>}<label><span>开始日期 {startDateLocked ? <small>已有完成历史；如需更改，请重新开始周期</small> : null}</span><input disabled={startDateLocked} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><button className="output-review-details-toggle" onClick={() => setShowDetails((value) => !value)} type="button">{showDetails ? "收起详细信息" : "添加详细信息"}<ChevronRightIcon data-open={showDetails} size={15} /></button>{showDetails ? <div className="output-review-form__details"><label><span>描述</span><textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label><label><span>学习材料链接</span><input onChange={(event) => setMaterialUrl(event.target.value)} placeholder="https://" type="url" value={materialUrl} /></label><label><span>为什么要复习</span><textarea onChange={(event) => setReviewReason(event.target.value)} rows={2} value={reviewReason} /></label><label><span>难度 <small>只作描述，不改变排程</small></span><select onChange={(event) => setDifficulty(event.target.value as ReviewDifficulty)} value={difficulty}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label><label><span>标签</span><input onChange={(event) => setTags(event.target.value)} placeholder="#matrix #exam #weak-point" value={tags} /></label><label><span>备注</span><textarea onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} /></label></div> : null}<footer><button className="output-review-secondary" onClick={onCancel} type="button">取消</button><button className="output-review-primary" disabled={!title.trim() || !projectId} type="submit">{initial ? "保存修改" : "开始 1/2/4/7 复习"}</button></footer>{!projects.length ? <p className="output-review-form__warning">需要先到“项目”视图创建项目。</p> : null}</form></div>;
}

function ProjectForm({ onCancel, onSave }: { onCancel: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  return <div className="output-review-overlay"><form aria-label="新建项目" className="output-review-modal output-review-project-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name, description); }}><div className="output-review-modal__header"><div><span>NEW PROJECT</span><h2>新建学习项目</h2></div><button aria-label="关闭" onClick={onCancel} type="button">×</button></div><label><span>项目名称 <b>必填</b></span><input autoFocus onChange={(event) => setName(event.target.value)} placeholder="例如：线性代数" required value={name} /></label><label><span>描述</span><textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label><footer><button className="output-review-secondary" onClick={onCancel} type="button">取消</button><button className="output-review-primary" type="submit">创建项目</button></footer></form></div>;
}

function KnowledgeDetail({ point, project, cycles, onClose, onEdit, onPauseResume, onAction }: { point: KnowledgePoint; project?: OutputReviewProject; cycles: OutputReviewState["cycles"]; onClose: () => void; onEdit: () => void; onPauseResume: () => void; onAction: (kind: "restart" | "master" | "archive" | "delete") => void }) {
  const currentCycle = cycles.find((cycle) => cycle.isCurrent);
  const fields = [{ label: "描述", value: point.description }, { label: "为什么要复习", value: point.reviewReason }, { label: "备注", value: point.notes }].filter((field) => field.value);
  return <div className="output-review-detail-overlay"><aside aria-label={`知识点详情：${point.title}`} className="output-review-detail"><header><div><span>{project?.name ?? "未知项目"}</span><h2>{point.title}</h2><div><span className="output-review-status" data-status={point.status}>{statusLabel(point.status)}</span>{point.difficulty ? <small>{({ easy: "简单", medium: "中等", hard: "困难" } as const)[point.difficulty]}</small> : null}</div></div><button aria-label="关闭详情" onClick={onClose} type="button">×</button></header>{currentCycle ? <ReviewProgress cycle={currentCycle} currentEvent={currentCycle.events.find((event) => event.stage === point.currentStage)} /> : null}<div className="output-review-detail__actions"><button onClick={onEdit} type="button">编辑</button>{point.status !== "mastered" && point.status !== "archived" ? <button onClick={onPauseResume} type="button">{point.status === "paused" ? "恢复周期" : "暂停周期"}</button> : null}<button onClick={() => onAction("restart")} type="button"><RotateCcwIcon size={14} />重新开始</button>{point.status !== "mastered" ? <button onClick={() => onAction("master")} type="button"><CheckIcon size={14} />标记掌握</button> : null}<button onClick={() => onAction("archive")} type="button">归档</button><button data-danger onClick={() => onAction("delete")} type="button"><Trash2Icon size={14} />删除</button></div>{fields.length || point.materialUrl || point.tags.length ? <section className="output-review-detail__context"><h3>学习语境</h3>{fields.map((field) => <div key={field.label}><span>{field.label}</span><p>{field.value}</p></div>)}{point.materialUrl ? <div><span>学习材料</span><a href={point.materialUrl} rel="noreferrer" target="_blank">打开学习材料<ArrowUpRightIcon size={14} /></a></div> : null}{point.tags.length ? <div><span>标签</span><p className="output-review-tags">{point.tags.map((tag) => <span key={tag}>#{tag}</span>)}</p></div> : null}</section> : null}<section className="output-review-timeline"><h3>复习时间线</h3>{cycles.slice().reverse().map((cycle, cycleIndex) => <div className="output-review-cycle" key={cycle.id}><div className="output-review-cycle__heading"><strong>{cycle.isCurrent ? "当前周期" : `历史周期 ${cycles.length - cycleIndex - 1}`}</strong><span>Day 0 · {timestampFormatter.format(new Date(cycle.startedAt))}</span></div>{cycle.events.map((event) => <TimelineEvent event={event} key={event.id} />)}</div>)}</section></aside></div>;
}

function TimelineEvent({ event }: { event: ReviewEvent }) {
  const adjusted = event.originalPlannedDate !== event.currentPlannedDate;
  return <div className="output-review-timeline-event" data-status={event.status}><span className="output-review-timeline-event__node">{event.status === "completed" ? <CheckIcon size={12} /> : null}</span><div><strong>{STAGE_LABELS[event.stage]}</strong><p>{adjusted ? <>原计划 {formatReviewDate(event.originalPlannedDate)} · 当前 {formatReviewDate(event.currentPlannedDate)}</> : <>计划 {formatReviewDate(event.originalPlannedDate)}</>}</p>{event.completedAt ? <small>完成于 {timestampFormatter.format(new Date(event.completedAt))} · {(event.delayDays ?? 0) > 0 ? `延迟 ${event.delayDays} 天，并顺延后续计划` : "按时或提前"}</small> : <small>{event.status === "skipped" ? "已停止" : "等待完成"}</small>}</div></div>;
}

function ConfirmationDialog({ action, onCancel, onConfirm }: { action: ConfirmAction; onCancel: () => void; onConfirm: () => void }) {
  const copy = {
    complete: { title: "完成这次输出复习？", description: "将保存实际完成时间，并在逾期时自动顺延未来计划。", action: "完成" },
    restart: { title: "重新开始 1/2/4/7 周期？", description: "当前周期会保留在历史中，并以今天创建新的 Day 0。", action: "重新开始" },
    master: { title: "将知识点标记为掌握？", description: "这会停止所有未来自动复习，但保留历史记录。", action: "标记掌握" },
    archive: { title: "归档这个知识点？", description: "它将退出活跃视图和提醒，历史仍然可搜索。", action: "归档" },
    delete: { title: "永久删除这个知识点？", description: "知识点和全部复习历史都会被删除，此操作无法恢复。", action: "永久删除" },
  }[action.kind];
  return <div className="output-review-overlay output-review-overlay--confirm"><div aria-modal="true" className="output-review-confirm" role="dialog"><div className="output-review-confirm__icon" data-danger={action.kind === "delete"}>{action.kind === "delete" ? <Trash2Icon size={21} /> : <CheckIcon size={21} />}</div><h2>{copy.title}</h2><p>{copy.description}</p><footer><button className="output-review-secondary" onClick={onCancel} type="button">取消</button><button className="output-review-primary" data-danger={action.kind === "delete"} onClick={onConfirm} type="button">{copy.action}</button></footer></div></div>;
}
