"use client";

import { useState } from "react";
import { ArrowRightIcon, ArrowUpRightIcon } from "@/components/auris-ui/auris-icons";
import { reviewUrgencyLabel, OutputReviewCard } from "./output-review-card";
import { STAGE_LABELS, type ReviewQueueItem } from "@/features/output-review/output-review-model";

type ReviewPrioritySectionProps = {
  actionableCount: number;
  hasKnowledgePoints: boolean;
  queue: ReviewQueueItem[];
  onAdd: () => void;
  onComplete: (knowledgePointId: string) => void;
  onOpen: (knowledgePointId: string) => void;
  onShowAll: () => void;
};

export function ReviewPrioritySection({
  actionableCount, hasKnowledgePoints, queue, onAdd, onComplete, onOpen, onShowAll,
}: ReviewPrioritySectionProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const selected = queue.find(({ event }) => event.id === selectedEventId) ?? queue[0];

  return (
    <section aria-labelledby="review-priority-title" className="review-priority">
      <header className="review-priority__banner">
        <div>
          <h2 id="review-priority-title">优先处理</h2>
          <p>{actionableCount > 0 ? "逾期任务优先，其次处理今天到期的任务。" : "今天没有待处理的到期任务。"}</p>
        </div>
        <p className="review-priority__count"><strong>{actionableCount}</strong><span>项待处理</span></p>
      </header>
      {selected ? (
        <div className="review-priority__workspace" data-has-queue={queue.length > 1}>
          <OutputReviewCard item={selected} onComplete={onComplete} onOpen={onOpen} />
          <div className="review-priority__sidebar">
            {queue.length > 1 ? (
              <section aria-labelledby="review-priority-queue-title" className="review-priority__queue">
                <header>
                  <h3 id="review-priority-queue-title">复习队列</h3>
                  <span>{queue.length} 项计划</span>
                </header>
                <ul>
                  {queue.map((item) => (
                    <li key={item.event.id}>
                      <button
                        aria-pressed={item.event.id === selected.event.id}
                        className="review-priority__task"
                        data-urgency={item.urgency}
                        onClick={() => setSelectedEventId(item.event.id)}
                        type="button"
                      >
                        <span className="review-priority__task-name">
                          <strong>{item.knowledgePoint.title}</strong>
                          <small>{item.project.name} · {STAGE_LABELS[item.event.stage]}</small>
                        </span>
                        <span className="review-priority__task-date">{reviewUrgencyLabel(item)}</span>
                        <ArrowRightIcon aria-hidden="true" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <button className="review-today-link review-priority__all" onClick={onShowAll} type="button">
              查看全部知识点 <ArrowUpRightIcon size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="review-priority__empty">
          <div>
            <h3>{hasKnowledgePoints ? "当前没有待复习的计划" : "还没有复习周期"}</h3>
            {!hasKnowledgePoints ? <p>添加知识点，开启 1/2/4/7 复习计划。</p> : null}
          </div>
          <button className="review-today-link" onClick={hasKnowledgePoints ? onShowAll : onAdd} type="button">
            {hasKnowledgePoints ? "查看全部知识点" : "添加第一个知识点"} <ArrowUpRightIcon size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
