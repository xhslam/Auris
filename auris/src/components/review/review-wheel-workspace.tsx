"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getProjectStats, type OutputReviewState, type ReviewQueueItem } from "@/features/output-review/output-review-model";
import { formatReviewDate } from "./output-review-card";
import "./review-wheel-workspace.css";

const LABELS = ["今日复习任务", "已经逾期的任务", "我创建的项目"];
const SPLIT_KEY = "auris.review.split";
const clamp = (value: number) => Math.max(35, Math.min(60, value));

export function ReviewWheelWorkspace({ children, state, queue, onOpen, onAddProject }: {
  children: ReactNode;
  state: OutputReviewState;
  queue: ReviewQueueItem[];
  onOpen: (id: string) => void;
  onAddProject: () => void;
}) {
  const [split, setSplit] = useState(45);
  const [rotation, setRotation] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const grip = useRef<number | null>(null);
  const lastTurn = useRef(-Infinity);
  const active = ((rotation % 3) + 3) % 3;
  const today = queue.filter((item) => item.urgency === "today");
  const overdue = queue.filter((item) => item.urgency === "overdue");
  const counts = [today.length, overdue.length, state.projects.length];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SPLIT_KEY);
      if (saved !== null && Number.isFinite(Number(saved))) setSplit(clamp(Number(saved)));
    } catch { /* Layout persistence is optional. */ }
  }, []);

  const resize = (next: number) => {
    const value = clamp(next);
    setSplit(value);
    try { window.localStorage.setItem(SPLIT_KEY, String(value)); } catch { /* Keep the live layout. */ }
  };
  const turn = (direction: number) => {
    if (performance.now() - lastTurn.current < 1200) return;
    lastTurn.current = performance.now();
    setRotation((current) => current + direction);
  };

  return <div className="review-wheel-workspace" ref={root} style={{ "--review-split": `${split}%` } as CSSProperties}>
    <section className="review-wheel-workspace__left" aria-label="复习执行工作区">{children}</section>
    <div className="review-wheel-workspace__divider" role="separator" aria-label="调整复习左右区域宽度" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={60} aria-valuenow={Math.round(split)} tabIndex={0}
      onDoubleClick={() => resize(45)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        resize(event.key === "Home" ? 35 : event.key === "End" ? 60 : split + (event.key === "ArrowRight" ? 2 : -2));
      }}
      onPointerDown={(event) => { if (event.button !== 0) return; grip.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => {
        const bounds = root.current?.getBoundingClientRect();
        if (grip.current !== event.pointerId || !bounds?.width) return;
        resize((event.clientX - bounds.left) / bounds.width * 100);
      }}
      onPointerUp={() => { grip.current = null; }} onPointerCancel={() => { grip.current = null; }} onLostPointerCapture={() => { grip.current = null; }}><i /></div>
    <section className="review-wheel" aria-label="复习摩天轮">
      <header className="review-wheel__heading"><div><span>YOUR LEARNING ORBIT</span><h2>让知识，再转一圈。</h2></div><span className="review-wheel__pace">慢速 · 手动切换</span></header>
      <div className="review-wheel__tabs" role="tablist" aria-label="摩天轮内容">
        {LABELS.map((label, index) => <button type="button" role="tab" id={`review-wheel-tab-${index}`} aria-controls={`review-wheel-panel-${index}`} aria-selected={active === index} key={label} onClick={() => { const distance = (index - active + 3) % 3; if (distance) turn(distance === 2 ? -1 : 1); }}>{label}<b>{counts[index]}</b></button>)}
      </div>
      <div className="review-wheel__stage" onWheel={(event) => {
        if ((event.target as Element).closest(".review-wheel__cabin") || Math.abs(event.deltaY) < 12) return;
        turn(event.deltaY > 0 ? 1 : -1);
      }}>
        <div className="review-wheel__rim" aria-hidden="true"><i /><i /><i /><span>1 · 2 · 4 · 7</span></div>
        {LABELS.map((label, index) => <div className="review-wheel__gondola" key={label} data-active={active === index} style={{ "--cabin-angle": `${(index - rotation) * 120}deg` } as CSSProperties}>
          <section className="review-wheel__cabin" role="tabpanel" id={`review-wheel-panel-${index}`} aria-labelledby={`review-wheel-tab-${index}`} aria-hidden={active !== index} inert={active !== index}>
            <header><span>0{index + 1} / {index === 2 ? "COLLECTIONS" : index === 1 ? "CATCH UP" : "TODAY"}</span><h3>{label}<b>{counts[index]}</b></h3></header>
            <div className="review-wheel__items">
              {index < 2 ? (index === 0 ? today : overdue).map((item) => <button className="review-wheel__item" type="button" key={item.event.id} onClick={() => onOpen(item.knowledgePoint.id)}><small>{item.project.name}<em data-overdue={index === 1}>{index === 1 ? `逾期 ${item.overdueDays} 天` : formatReviewDate(item.event.currentPlannedDate)}</em></small><strong>{item.knowledgePoint.title}</strong><span>打开复习详情 ↗</span></button>) : state.projects.map((project) => {
                const stats = getProjectStats(state, project.id);
                const expanded = projectId === project.id;
                const points = state.knowledgePoints.filter((point) => point.projectId === project.id && point.status !== "archived");
                return <div key={project.id}><button className="review-wheel__item" type="button" aria-expanded={expanded} onClick={() => setProjectId(expanded ? null : project.id)}><small>学习项目<em>{Math.round(stats.progress * 100)}%</em></small><strong>{project.name}</strong><span>{stats.total} 个知识点 · {stats.mastered} 已掌握 · {stats.overdue} 逾期</span></button>{expanded ? <div className="review-wheel__project-points">{points.map((point) => <button key={point.id} type="button" onClick={() => onOpen(point.id)}>{point.title} ↗</button>)}{!points.length ? <p>这个项目还没有知识点。</p> : null}</div> : null}</div>;
              })}
              {counts[index] === 0 ? <div className="review-wheel__empty"><span>{index === 2 ? "＋" : "✓"}</span><strong>{index === 0 ? "今天没有到期任务" : index === 1 ? "没有逾期，轻装前行" : "给学习一个归属"}</strong><p>{index === 2 ? "创建项目，收集想要真正掌握的知识。" : "可以转动摩天轮，看看其他内容。"}</p></div> : null}
            </div>
            <footer>{index === 2 ? <button type="button" onClick={onAddProject}>＋ 新建项目</button> : <span>先回忆，再校验。每次只专注一件事。</span>}</footer>
          </section>
        </div>)}
      </div>
      <footer className="review-wheel__controls"><div aria-live="polite"><span>正在浏览</span><strong>{LABELS[active]}</strong><small>0{active + 1} / 03</small></div><div className="review-wheel__joystick" role="group" aria-label="摩天轮摇杆"><button type="button" aria-label="上一组卡片" onClick={() => turn(-1)}>←</button><button type="button" className="review-wheel__stick" aria-label="按下摇杆切换下一组" onClick={() => turn(1)}><i /></button><button type="button" aria-label="下一组卡片" onClick={() => turn(1)}>→</button><span>轻按一下，慢慢转动</span></div></footer>
    </section>
  </div>;
}
