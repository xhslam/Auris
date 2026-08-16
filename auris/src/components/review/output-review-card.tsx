import { ArrowRightIcon, BookOpenIcon, CheckIcon } from "@/components/auris-ui/auris-icons";
import {
  REVIEW_STAGES,
  STAGE_LABELS,
  toLocalDateKey,
  type KnowledgePoint,
  type OutputReviewProject,
  type ReviewCycle,
  type ReviewEvent,
  type ReviewQueueItem,
} from "@/features/output-review/output-review-model";

type OutputReviewCardProps = {
  item: ReviewQueueItem;
  onComplete: (knowledgePointId: string) => void;
  onOpen: (knowledgePointId: string) => void;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" });

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

export function formatReviewDate(value: string) {
  return dateFormatter.format(localDate(value));
}

export function ReviewProgress({ cycle, currentEvent }: { cycle: ReviewCycle; currentEvent?: ReviewEvent }) {
  const today = toLocalDateKey(new Date());
  return (
    <div className="output-review-progress" aria-label="1/2/4/7 复习进度">
      {REVIEW_STAGES.map((stage, index) => {
        const event = cycle.events.find((candidate) => candidate.stage === stage);
        const state = event?.status === "completed" ? "completed" : event?.id === currentEvent?.id && (event?.currentPlannedDate ?? today) < today ? "overdue" : event?.id === currentEvent?.id ? "current" : "future";
        const stateLabel = state === "completed" ? "已完成" : state === "overdue" ? "已逾期" : state === "current" ? "当前阶段" : "未来阶段";
        return (
          <div className="output-review-progress__step" key={stage}>
            <span aria-label={`${STAGE_LABELS[stage]}：${stateLabel}`} className="output-review-progress__node" data-state={state} role="img">{state === "completed" ? <CheckIcon size={11} /> : null}</span>
            <span className="output-review-progress__label">{STAGE_LABELS[stage]}</span>
            <span className="output-review-progress__date">{event ? formatReviewDate(event.currentPlannedDate) : "—"}</span>
            {index < REVIEW_STAGES.length - 1 ? <span aria-hidden="true" className="output-review-progress__line" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function OutputReviewCard({ item, onComplete, onOpen }: OutputReviewCardProps) {
  const completed = item.cycle.events.filter((event) => event.status === "completed").length;
  const urgencyCopy = item.urgency === "overdue" ? `逾期 ${item.overdueDays} 天` : item.urgency === "today" ? "今天到期" : `${formatReviewDate(item.event.currentPlannedDate)} 到期`;
  const difficultyCopy = item.knowledgePoint.difficulty === "hard" ? "高强度" : item.knowledgePoint.difficulty === "easy" ? "轻量" : "标准";
  const reviewPoints = Array.from(new Set([
    item.knowledgePoint.reviewReason,
    item.knowledgePoint.description,
    ...item.knowledgePoint.tags.map((tag) => `围绕「${tag}」做一次脱稿输出`),
    "先闭卷回忆，再对照材料校验",
    "记录仍然卡住的一个问题",
  ].filter((value): value is string => Boolean(value?.trim())))).slice(0, 3);
  return (
    <article className="output-review-card" data-urgency={item.urgency}>
      <div className="output-review-card__topline"><span className="output-review-card__project">{item.project.name}</span><span className="output-review-card__badges"><span className="output-review-card__urgency">{urgencyCopy}</span><span className="output-review-card__stage">当前 {STAGE_LABELS[item.event.stage]}</span></span></div>
      <button aria-label={`查看知识点：${item.knowledgePoint.title}`} className="output-review-card__open" onClick={() => onOpen(item.knowledgePoint.id)} type="button">
        <span className="output-review-card__title">{item.knowledgePoint.title}</span>
        <span className="output-review-card__meta">复习阶段：{difficultyCopy} · {item.project.name}{item.knowledgePoint.tags.length ? ` · ${item.knowledgePoint.tags.slice(0, 2).join(" / ")}` : ""}</span>
      </button>
      <div className="output-review-card__body">
        <ReviewProgress cycle={item.cycle} currentEvent={item.event} />
        <div className="output-review-card__prompts"><strong><BookOpenIcon size={15} />复习要点</strong><ul>{reviewPoints.map((point) => <li key={point}>{point}</li>)}</ul></div>
      </div>
      <div className="output-review-card__footer"><span><CheckIcon size={14} />{completed} / 4 次复习已完成</span><button className="output-review-card__complete" onClick={() => onComplete(item.knowledgePoint.id)} type="button">完成输出 <ArrowRightIcon size={16} /></button></div>
    </article>
  );
}

export function KnowledgePointRow({ point, project, cycle, onOpen }: { point: KnowledgePoint; project: OutputReviewProject; cycle?: ReviewCycle; onOpen: (knowledgePointId: string) => void }) {
  const completed = cycle?.events.filter((event) => event.status === "completed").length ?? 0;
  return (
    <button className="output-review-row" onClick={() => onOpen(point.id)} type="button">
      <span><strong>{point.title}</strong><small>{project.name} · {point.tags.map((tag) => `#${tag}`).join(" ") || "无标签"}</small></span>
      <span className="output-review-row__end"><span className="output-review-status" data-status={point.status}>{statusLabel(point.status)}</span><small>{completed} / 4</small></span>
    </button>
  );
}

export function statusLabel(status: KnowledgePoint["status"]) {
  return { active: "进行中", archived: "已归档", mastered: "已掌握", overdue: "已逾期", paused: "已暂停" }[status];
}
