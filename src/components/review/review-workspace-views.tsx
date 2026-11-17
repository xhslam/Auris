"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenIcon, CalendarDaysIcon, ListChecksIcon, SearchIcon,
} from "@/components/auris-ui/auris-icons";
import {
  addCalendarDays, currentCycleFor, getCompletedReviewEvents,
  getDashboardMetrics, STAGE_LABELS, type KnowledgePointStatus,
  type OutputReviewState, type ReviewQueueItem,
} from "@/features/output-review/output-review-model";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { countDailyJournalDays } from "./daily-journal-source";
import { DailyEvaluationDialog } from "./daily-evaluation-dialog";
import { formatReviewDate, statusLabel } from "./output-review-card";

export function ReviewTodayLanding({
  state, today, actionable, onReview, onAll, onBooks, onNotes,
}: {
  state: OutputReviewState; today: string; actionable: number;
  onReview: () => void; onAll: () => void; onBooks: () => void; onNotes: () => void;
}) {
  const [day, setDay] = useState(0);

  useEffect(() => {
    const vault = getDesktopBridge()?.vault;
    if (!vault) return;

    let request = 0;
    const refresh = () => {
      const current = ++request;
      void countDailyJournalDays(vault, today).then(
        count => { if (current === request) setDay(count); },
        () => { if (current === request) setDay(0); },
      );
    };
    const unsubscribe = vault.onDidChange(refresh);
    refresh();
    return () => {
      request++;
      unsubscribe();
    };
  }, [today]);

  return (
    <section aria-label="今日复习" className="review-workspace__today">
      <div>
        <h1>Day {day}</h1>
        <button className="review-workspace__primary" disabled={!state.knowledgePoints.length} onClick={onReview} type="button">
          复习全部
        </button>
        <p>{actionable ? `今日还剩 ${actionable} 项` : "今天没有到期知识点"}</p>
        <div className="review-workspace__actions">
          <button onClick={onBooks} type="button">书籍回顾</button>
          <button onClick={onNotes} type="button">笔记回顾</button>
          <button onClick={onAll} type="button">全部条目 {state.knowledgePoints.length}</button>
        </div>
      </div>
    </section>
  );
}

function plannedByDate(state: OutputReviewState) {
  const days = new Map<string, Array<OutputReviewState["knowledgePoints"][number]>>();
  for (const point of state.knowledgePoints) {
    if (point.status !== "active" && point.status !== "overdue") continue;
    for (const event of currentCycleFor(state, point.id)?.events ?? []) {
      if (event.status !== "pending") continue;
      const items = days.get(event.currentPlannedDate) ?? [];
      items.push(point);
      days.set(event.currentPlannedDate, items);
    }
  }
  return days;
}

const EVALUATION_PAGE_DAYS = 30;

export function ReviewPlan({
  state, today, onProjects, onToday,
}: {
  state: OutputReviewState; today: string; onProjects: () => void; onToday: () => void;
}) {
  const [page, setPage] = useState(0);
  const [evaluation, setEvaluation] = useState<{ date: string; trigger: HTMLButtonElement } | null>(null);
  const total = state.knowledgePoints.filter(point => point.status !== "archived").length;
  const mastered = state.knowledgePoints.filter(point => point.status === "mastered").length;
  const percent = total ? Math.round(mastered / total * 100) : 0;
  const lastDate = addCalendarDays(today, -page * EVALUATION_PAGE_DAYS);
  const firstDate = addCalendarDays(lastDate, 1 - EVALUATION_PAGE_DAYS);
  return (
    <section aria-label="复习计划" className="review-workspace__plan">
      <header className="review-workspace__plan-header">
        <div className="review-workspace__book"><BookOpenIcon size={19} />复习计划</div>
        <div className="review-workspace__plan-progress">
          <div><strong>{mastered}</strong> / {total}</div>
          <p>已掌握 {percent}% · 待掌握 {total - mastered} 项</p>
          <progress aria-label="掌握进度" max={100} value={percent} />
        </div>
      </header>
      <div className="review-workspace__bar review-workspace__plan-toolbar">
        <h2>每日评价</h2>
        <div className="review-workspace__actions">
          <button onClick={onToday} type="button">今日复盘</button>
          <button onClick={onProjects} type="button">管理项目</button>
        </div>
      </div>
      <div className="review-workspace__bar review-workspace__plan-range">
        <span aria-live="polite">{firstDate} 至 {lastDate}</span>
        <div className="review-workspace__actions">
          <button onClick={() => setPage(value => value + 1)} type="button">前 30 天</button>
          <button disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))} type="button">后 30 天</button>
        </div>
      </div>
      <div aria-label="每日评价日期" className="review-workspace__plan-grid" role="group">
        {Array.from({ length: EVALUATION_PAGE_DAYS }, (_, index) => {
          const date = addCalendarDays(firstDate, index);
          const isToday = date === today;
          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-haspopup="dialog"
              aria-label={`${date} 的每日评价`}
              key={date}
              onClick={event => setEvaluation({ date, trigger: event.currentTarget })}
              type="button"
            >
              <strong>{Number(date.slice(-2))}</strong>
              <span>{isToday ? "今天" : `${Number(date.slice(5, 7))} 月`}</span>
            </button>
          );
        })}
      </div>
      {evaluation && <DailyEvaluationDialog date={evaluation.date} onClose={() => {
        evaluation.trigger.focus();
        setEvaluation(null);
      }} />}
    </section>
  );
}

const filters: Array<KnowledgePointStatus | "all"> = ["all", "active", "overdue", "mastered", "paused", "archived"];

export function ReviewLibrary({
  state, today, catalog = false, selectedId, onSelect, detail,
}: {
  state: OutputReviewState; today: string; catalog?: boolean; selectedId: string | null;
  onSelect: (id: string) => void; detail?: React.ReactNode;
}) {
  const [projectId, setProjectId] = useState("");
  const [filter, setFilter] = useState<KnowledgePointStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [hideSummary, setHideSummary] = useState(false);
  const projects = new Map(state.projects.map(project => [project.id, project.name]));
  const points = state.knowledgePoints.filter(point => {
    const text = [point.title, point.description, point.notes, projects.get(point.projectId), ...point.tags].join(" ").toLocaleLowerCase();
    return (!projectId || projectId === point.projectId) && (filter === "all" || filter === point.status) && text.includes(query.trim().toLocaleLowerCase());
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeId = points.some(point => point.id === selectedId) ? selectedId : null;
  const metrics = getDashboardMetrics(state, today);
  return (
    <section aria-label={catalog ? "知识点目录" : "全部知识点"} className="review-workspace__library" data-catalog={catalog} data-detail={Boolean(activeId && detail)}>
      <div className="review-workspace__listing">
        {!catalog && <div className="review-workspace__library-metrics">
          <div>条目<strong>{state.knowledgePoints.length}</strong></div>
          <div>待复习<strong>{metrics.overdueCount + metrics.dueTodayCount}</strong></div>
          <div>已掌握<strong>{state.knowledgePoints.filter(point => point.status === "mastered").length}</strong></div>
        </div>}
        <div className="review-workspace__library-toolbar">
          {!catalog && <div className="review-workspace__segments" aria-label="条目布局" role="group">
            <button aria-pressed={!grid} onClick={() => setGrid(false)} type="button">列表</button>
            <button aria-pressed={grid} onClick={() => setGrid(true)} type="button">网格</button>
          </div>}
          <label className="review-workspace__search"><SearchIcon size={15} /><input aria-label="搜索知识点" onChange={event => setQuery(event.target.value)} placeholder="搜索条目" value={query} /></label>
          <select aria-label="学习项目" onChange={event => setProjectId(event.target.value)} value={projectId}>
            <option value="">全部项目</option>
            {state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {!catalog && <>
            <select aria-label="筛选状态" onChange={event => setFilter(event.target.value as typeof filter)} value={filter}>
              {filters.map(status => <option key={status} value={status}>{status === "all" ? "全部状态" : statusLabel(status)}</option>)}
            </select>
            <button aria-pressed={hideSummary} onClick={() => setHideSummary(value => !value)} type="button">{hideSummary ? "显示摘要" : "隐藏摘要"}</button>
          </>}
        </div>
        <div className="review-workspace__entries" data-grid={!catalog && grid}>
          {!catalog && !grid && <div className="review-workspace__entry-head"><span>条目</span><span>项目</span><span>摘要</span><span>阶段</span><span>状态</span></div>}
          {points.map(point => (
            <button aria-pressed={activeId === point.id} className="review-workspace__entry" key={point.id} onClick={() => onSelect(point.id)} type="button">
              <strong>{point.title}</strong>
              {!catalog && <span>{projects.get(point.projectId) ?? "—"}</span>}
              <span>{hideSummary ? "· · ·" : point.description || point.notes || "—"}</span>
              {!catalog && !grid && <span>{point.currentStage ? STAGE_LABELS[point.currentStage] : "—"}</span>}
              {!catalog && <span className="review-workspace__entry-status">{statusLabel(point.status)}</span>}
            </button>
          ))}
          {!points.length && <p className="review-workspace__empty">没有符合当前条件的知识点。</p>}
        </div>
      </div>
      {activeId && detail}
      {catalog && !activeId && <div className="review-workspace__detail-empty">选择一个知识点查看详情</div>}
    </section>
  );
}

export function ReviewCalendar({
  anchor, state, today, onClose, onToday, onOpen,
}: {
  anchor: HTMLButtonElement; state: OutputReviewState; today: string;
  onClose: () => void; onToday: () => void; onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const dialog = useRef<HTMLDialogElement>(null);
  const planned = useMemo(() => plannedByDate(state), [state]);
  const completed = useMemo(() => getCompletedReviewEvents(state), [state]);
  const completedDates = new Set(completed.map(item => item.completionDate));
  const points = new Map([
    ...(planned.get(selected) ?? []),
    ...completed.filter(item => item.completionDate === selected).map(item => item.point),
  ].map(point => [point.id, point]));
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const changeMonth = (direction: number) => {
    const date = new Date(`${first}T12:00:00`);
    date.setMonth(date.getMonth() + direction);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setMonth(key);
    setSelected(`${key}-01`);
  };

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    const position = () => {
      const anchorBox = anchor.getBoundingClientRect();
      node.style.insetInlineStart = `${anchorBox.right + 4}px`;
      node.style.top = `${Math.max(8, Math.min(anchorBox.top, window.innerHeight - node.offsetHeight - 8))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(node);
    window.addEventListener("resize", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      node.close();
    };
  }, [anchor]);

  return (
    <dialog aria-label="复习日历" className="review-workspace__calendar" id="review-calendar" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    } }} ref={dialog}>
      <div className="review-workspace__calendar-content">
        <div>
          <div className="review-workspace__bar">
            <strong>{Number(month.slice(-2))} 月</strong>
            <div className="review-workspace__actions">
              <button aria-label="上个月" onClick={() => changeMonth(-1)} type="button">‹</button>
              <button aria-label="下个月" onClick={() => changeMonth(1)} type="button">›</button>
              <button onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }} type="button">今天</button>
            </div>
          </div>
          <div className="review-workspace__calendar-grid">
            {Array.from("一二三四五六日", day => <span key={day}>{day}</span>)}
            {Array.from({ length: offset }, (_, index) => <span key={index} />)}
            {Array.from({ length: 31 }, (_, index) => addCalendarDays(first, index)).filter(date => date.startsWith(month)).map(date => (
              <button aria-label={formatReviewDate(date)} aria-pressed={date === selected} data-logged={completedDates.has(date)} key={date} onClick={() => setSelected(date)} type="button">{Number(date.slice(-2))}</button>
            ))}
          </div>
        </div>
        <div className="review-workspace__calendar-summary">
          <CalendarDaysIcon size={27} />
          {points.size ? Array.from(points.values(), point => <button key={point.id} onClick={() => onOpen(point.id)} type="button">{point.title}</button>) : <p>这天暂无复习记录</p>}
        </div>
      </div>
      <footer><span>{formatReviewDate(selected)}</span><button onClick={onToday} type="button">查看今日复习</button></footer>
    </dialog>
  );
}

export function ReviewBatch({
  queue, onOpen, onComplete, onBack,
}: { queue: ReviewQueueItem[]; onOpen: (id: string) => void; onComplete: (id: string) => void; onBack: () => void }) {
  const item = queue[0];
  return (
    <section className="review-workspace__today" aria-label="条目复习">
      <div className="review-workspace__batch">
        <ListChecksIcon size={24} />
        {item ? <>
          <p>剩余 {queue.length} 项 · {item.project.name}</p>
          <h2>{item.knowledgePoint.title}</h2>
          <details key={item.knowledgePoint.id}><summary>显示复习内容</summary><p>{item.knowledgePoint.description || item.knowledgePoint.notes || "可打开知识点查看学习语境。"}</p></details>
          <div className="review-workspace__actions">
            <button onClick={() => onOpen(item.knowledgePoint.id)} type="button">打开详情</button>
            <button className="review-workspace__primary" onClick={() => onComplete(item.knowledgePoint.id)} type="button">完成复习</button>
          </div>
        </> : <h2>所选条目没有待完成的复习</h2>}
        <button onClick={onBack} type="button">返回今日复习</button>
      </div>
    </section>
  );
}
