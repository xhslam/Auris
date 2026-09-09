export const REVIEW_STAGES = ["day1", "day2", "day4", "day7"] as const;

export type ReviewStage = (typeof REVIEW_STAGES)[number];
export type KnowledgePointStatus =
  | "active"
  | "overdue"
  | "paused"
  | "mastered"
  | "archived";
export type ReviewDifficulty = "easy" | "medium" | "hard";

export type OutputReviewProject = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgePoint = {
  id: string;
  title: string;
  projectId: string;
  description?: string;
  materialUrl?: string;
  reviewReason?: string;
  difficulty?: ReviewDifficulty;
  tags: string[];
  notes?: string;
  startDate: string;
  status: KnowledgePointStatus;
  currentStage: ReviewStage | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewEvent = {
  id: string;
  knowledgePointId: string;
  stage: ReviewStage;
  originalPlannedDate: string;
  currentPlannedDate: string;
  completedAt?: string;
  delayDays?: number;
  scheduleShiftDays?: number;
  status: "pending" | "completed" | "skipped";
};

export type ReviewCycle = {
  id: string;
  knowledgePointId: string;
  startedAt: string;
  completedAt?: string;
  isCurrent: boolean;
  events: ReviewEvent[];
};

export type OutputReviewState = {
  version: 1;
  projects: OutputReviewProject[];
  knowledgePoints: KnowledgePoint[];
  cycles: ReviewCycle[];
};

export type CreateKnowledgePointInput = {
  title: string;
  projectId: string;
  startDate: string;
  description?: string;
  materialUrl?: string;
  reviewReason?: string;
  difficulty?: ReviewDifficulty;
  tags?: string[];
  notes?: string;
};

export type ReviewQueueItem = {
  knowledgePoint: KnowledgePoint;
  project: OutputReviewProject;
  cycle: ReviewCycle;
  event: ReviewEvent;
  overdueDays: number;
  urgency: "overdue" | "today" | "upcoming";
};

export const STAGE_OFFSETS: Record<ReviewStage, number> = {
  day1: 1,
  day2: 2,
  day4: 4,
  day7: 7,
};

export const STAGE_LABELS: Record<ReviewStage, string> = {
  day1: "Day 1",
  day2: "Day 2",
  day4: "Day 4",
  day7: "Day 7",
};

export const EMPTY_OUTPUT_REVIEW_STATE: OutputReviewState = {
  version: 1,
  projects: [],
  knowledgePoints: [],
  cycles: [],
};

function identifier(prefix: string) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function toLocalDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  const laterDate = parseDateKey(later);
  const earlierDate = parseDateKey(earlier);
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / 86_400_000);
}

export function currentCycleFor(
  state: OutputReviewState,
  knowledgePointId: string,
): ReviewCycle | undefined {
  return state.cycles.find(
    (cycle) => cycle.knowledgePointId === knowledgePointId && cycle.isCurrent,
  );
}

function buildCycle(
  knowledgePointId: string,
  startDate: string,
  startedAt: string,
): ReviewCycle {
  return {
    id: identifier("cycle"),
    knowledgePointId,
    startedAt,
    isCurrent: true,
    events: REVIEW_STAGES.map((stage) => {
      const plannedDate = addCalendarDays(startDate, STAGE_OFFSETS[stage]);
      return {
        id: identifier(`review-${stage}`),
        knowledgePointId,
        stage,
        originalPlannedDate: plannedDate,
        currentPlannedDate: plannedDate,
        status: "pending" as const,
      };
    }),
  };
}

export function createProject(
  state: OutputReviewState,
  input: { name: string; description?: string },
  now = new Date(),
): OutputReviewState {
  const name = input.name.trim();
  if (!name) return state;
  const existing = state.projects.find(
    (project) => project.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (existing) return state;
  const timestamp = now.toISOString();
  return {
    ...state,
    projects: [
      ...state.projects,
      {
        id: identifier("project"),
        name,
        description: input.description?.trim() || undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (tags ?? [])
        .flatMap((tag) => tag.split(/[#,\s]+/))
        .map((tag) => tag.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  );
}

export function createKnowledgePoint(
  state: OutputReviewState,
  input: CreateKnowledgePointInput,
  now = new Date(),
): OutputReviewState {
  const title = input.title.trim();
  if (!title || !state.projects.some((project) => project.id === input.projectId)) {
    return state;
  }
  const timestamp = now.toISOString();
  const id = identifier("knowledge");
  const knowledgePoint: KnowledgePoint = {
    id,
    title,
    projectId: input.projectId,
    description: input.description?.trim() || undefined,
    materialUrl: input.materialUrl?.trim() || undefined,
    reviewReason: input.reviewReason?.trim() || undefined,
    difficulty: input.difficulty,
    tags: normalizeTags(input.tags),
    notes: input.notes?.trim() || undefined,
    startDate: input.startDate,
    status: "active",
    currentStage: "day1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...state,
    knowledgePoints: [...state.knowledgePoints, knowledgePoint],
    cycles: [...state.cycles, buildCycle(id, input.startDate, timestamp)],
  };
}

export function updateKnowledgePoint(
  state: OutputReviewState,
  knowledgePointId: string,
  input: Omit<CreateKnowledgePointInput, "startDate"> & { startDate?: string },
  now = new Date(),
): OutputReviewState {
  const current = state.knowledgePoints.find((item) => item.id === knowledgePointId);
  if (!current || !input.title.trim()) return state;
  const cycle = currentCycleFor(state, knowledgePointId);
  const hasCompleted = cycle?.events.some((event) => event.status === "completed") ?? false;
  const canChangeStartDate = !hasCompleted;
  const startDate = canChangeStartDate && input.startDate ? input.startDate : current.startDate;
  const timestamp = now.toISOString();
  return {
    ...state,
    knowledgePoints: state.knowledgePoints.map((item) =>
      item.id === knowledgePointId
        ? {
            ...item,
            title: input.title.trim(),
            projectId: input.projectId,
            startDate,
            description: input.description?.trim() || undefined,
            materialUrl: input.materialUrl?.trim() || undefined,
            reviewReason: input.reviewReason?.trim() || undefined,
            difficulty: input.difficulty,
            tags: normalizeTags(input.tags),
            notes: input.notes?.trim() || undefined,
            updatedAt: timestamp,
          }
        : item,
    ),
    cycles:
      canChangeStartDate && startDate !== current.startDate
        ? state.cycles.map((item) =>
            item.id === cycle?.id ? buildCycle(knowledgePointId, startDate, timestamp) : item,
          )
        : state.cycles,
  };
}

export function refreshReviewStatuses(
  state: OutputReviewState,
  today = toLocalDateKey(new Date()),
): OutputReviewState {
  let changed = false;
  const knowledgePoints = state.knowledgePoints.map((point) => {
    if (["paused", "mastered", "archived"].includes(point.status)) return point;
    const event = currentCycleFor(state, point.id)?.events.find(
      (candidate) => candidate.stage === point.currentStage,
    );
    const nextStatus: KnowledgePointStatus =
      event?.status === "pending" && event.currentPlannedDate < today ? "overdue" : "active";
    if (nextStatus === point.status) return point;
    changed = true;
    return { ...point, status: nextStatus };
  });
  return changed ? { ...state, knowledgePoints } : state;
}

export function completeCurrentReview(
  state: OutputReviewState,
  knowledgePointId: string,
  completedAt = new Date(),
): OutputReviewState {
  const point = state.knowledgePoints.find((item) => item.id === knowledgePointId);
  const cycle = currentCycleFor(state, knowledgePointId);
  if (!point || !cycle || !point.currentStage || point.status === "paused") return state;
  const currentIndex = REVIEW_STAGES.indexOf(point.currentStage);
  const currentEvent = cycle.events.find((event) => event.stage === point.currentStage);
  if (!currentEvent || currentEvent.status !== "pending") return state;

  const completionDate = toLocalDateKey(completedAt);
  const delayDays = Math.max(
    0,
    differenceInCalendarDays(completionDate, currentEvent.currentPlannedDate),
  );
  const completedTimestamp = completedAt.toISOString();
  const isMastered = point.currentStage === "day7";
  const nextStage = isMastered ? null : REVIEW_STAGES[currentIndex + 1] ?? null;
  const cycles = state.cycles.map((candidate) => {
    if (candidate.id !== cycle.id) return candidate;
    return {
      ...candidate,
      completedAt: isMastered ? completedTimestamp : candidate.completedAt,
      events: candidate.events.map((event) => {
        if (event.id === currentEvent.id) {
          return {
            ...event,
            completedAt: completedTimestamp,
            delayDays,
            scheduleShiftDays: delayDays,
            status: "completed" as const,
          };
        }
        if (delayDays > 0 && event.status === "pending") {
          return {
            ...event,
            currentPlannedDate: addCalendarDays(event.currentPlannedDate, delayDays),
          };
        }
        return event;
      }),
    };
  });
  const nextState: OutputReviewState = {
    ...state,
    cycles,
    knowledgePoints: state.knowledgePoints.map((candidate) =>
      candidate.id === point.id
        ? {
            ...candidate,
            currentStage: nextStage,
            status: isMastered ? "mastered" : "active",
            updatedAt: completedTimestamp,
          }
        : candidate,
    ),
  };
  return refreshReviewStatuses(nextState, completionDate);
}

export function setKnowledgePointStatus(
  state: OutputReviewState,
  knowledgePointId: string,
  action: "pause" | "resume" | "master" | "archive",
  now = new Date(),
): OutputReviewState {
  const point = state.knowledgePoints.find((item) => item.id === knowledgePointId);
  const cycle = currentCycleFor(state, knowledgePointId);
  if (!point) return state;
  const timestamp = now.toISOString();
  const today = toLocalDateKey(now);

  if (action === "resume" && point.status === "paused" && cycle && point.currentStage) {
    const currentOffset = STAGE_OFFSETS[point.currentStage];
    return refreshReviewStatuses(
      {
        ...state,
        knowledgePoints: state.knowledgePoints.map((item) =>
          item.id === point.id ? { ...item, status: "active", updatedAt: timestamp } : item,
        ),
        cycles: state.cycles.map((item) =>
          item.id === cycle.id
            ? {
                ...item,
                events: item.events.map((event) =>
                  event.status === "pending"
                    ? {
                        ...event,
                        currentPlannedDate: addCalendarDays(
                          today,
                          STAGE_OFFSETS[event.stage] - currentOffset,
                        ),
                      }
                    : event,
                ),
              }
            : item,
        ),
      },
      today,
    );
  }

  const status: KnowledgePointStatus =
    action === "pause"
      ? "paused"
      : action === "master"
        ? "mastered"
        : action === "archive"
          ? "archived"
          : point.status;
  return {
    ...state,
    knowledgePoints: state.knowledgePoints.map((item) =>
      item.id === point.id
        ? {
            ...item,
            status,
            currentStage: action === "master" ? null : item.currentStage,
            updatedAt: timestamp,
          }
        : item,
    ),
    cycles: state.cycles.map((item) =>
      item.id === cycle?.id && action === "master"
        ? {
            ...item,
            completedAt: timestamp,
            events: item.events.map((event) =>
              event.status === "pending" ? { ...event, status: "skipped" as const } : event,
            ),
          }
        : item,
    ),
  };
}

export function restartReviewCycle(
  state: OutputReviewState,
  knowledgePointId: string,
  now = new Date(),
): OutputReviewState {
  const point = state.knowledgePoints.find((item) => item.id === knowledgePointId);
  if (!point) return state;
  const timestamp = now.toISOString();
  const startDate = toLocalDateKey(now);
  return {
    ...state,
    knowledgePoints: state.knowledgePoints.map((item) =>
      item.id === point.id
        ? {
            ...item,
            startDate,
            status: "active",
            currentStage: "day1",
            updatedAt: timestamp,
          }
        : item,
    ),
    cycles: [
      ...state.cycles.map((cycle) =>
        cycle.knowledgePointId === point.id ? { ...cycle, isCurrent: false } : cycle,
      ),
      buildCycle(point.id, startDate, timestamp),
    ],
  };
}

export function deleteKnowledgePoint(
  state: OutputReviewState,
  knowledgePointId: string,
): OutputReviewState {
  return {
    ...state,
    knowledgePoints: state.knowledgePoints.filter((item) => item.id !== knowledgePointId),
    cycles: state.cycles.filter((cycle) => cycle.knowledgePointId !== knowledgePointId),
  };
}

export function getReviewQueue(
  state: OutputReviewState,
  today = toLocalDateKey(new Date()),
): ReviewQueueItem[] {
  const difficultyRank: Record<ReviewDifficulty, number> = { hard: 0, medium: 1, easy: 2 };
  return state.knowledgePoints
    .filter((point) => point.status === "active" || point.status === "overdue")
    .flatMap((knowledgePoint) => {
      const project = state.projects.find((item) => item.id === knowledgePoint.projectId);
      const cycle = currentCycleFor(state, knowledgePoint.id);
      const event = cycle?.events.find((item) => item.stage === knowledgePoint.currentStage);
      if (!project || !cycle || !event || event.status !== "pending") return [];
      const overdueDays = Math.max(
        0,
        differenceInCalendarDays(today, event.currentPlannedDate),
      );
      return [{
        knowledgePoint,
        project,
        cycle,
        event,
        overdueDays,
        urgency:
          event.currentPlannedDate < today
            ? "overdue"
            : event.currentPlannedDate === today
              ? "today"
              : "upcoming",
      } satisfies ReviewQueueItem];
    })
    .sort((left, right) => {
      const urgencyRank = { overdue: 0, today: 1, upcoming: 2 };
      const urgency = urgencyRank[left.urgency] - urgencyRank[right.urgency];
      if (urgency !== 0) return urgency;
      if (left.urgency === "overdue" && left.overdueDays !== right.overdueDays) {
        return right.overdueDays - left.overdueDays;
      }
      const difficulty =
        difficultyRank[left.knowledgePoint.difficulty ?? "medium"] -
        difficultyRank[right.knowledgePoint.difficulty ?? "medium"];
      if (difficulty !== 0) return difficulty;
      const date = left.event.currentPlannedDate.localeCompare(right.event.currentPlannedDate);
      if (date !== 0) return date;
      return left.knowledgePoint.createdAt.localeCompare(right.knowledgePoint.createdAt);
    });
}

export function getDashboardMetrics(
  state: OutputReviewState,
  today = toLocalDateKey(new Date()),
) {
  const queue = getReviewQueue(state, today);
  const completedEvents = state.cycles.flatMap((cycle) => cycle.events).filter(
    (event) => event.status === "completed" && event.completedAt,
  );
  const completedToday = completedEvents.filter(
    (event) => event.completedAt && toLocalDateKey(event.completedAt) === today,
  ).length;
  const overdue = queue.filter((item) => item.urgency === "overdue");
  const dueToday = queue.filter((item) => item.urgency === "today");
  const weekDate = parseDateKey(today);
  const day = weekDate.getDay() || 7;
  weekDate.setDate(weekDate.getDate() - day + 1);
  const weekStart = toLocalDateKey(weekDate);
  const weeklyOutputs = completedEvents.filter((event) => {
    const completedDate = toLocalDateKey(event.completedAt!);
    return completedDate >= weekStart && completedDate <= today;
  }).length;
  const onTime = completedEvents.filter((event) => (event.delayDays ?? 0) === 0).length;
  const delayed = completedEvents.filter((event) => (event.delayDays ?? 0) > 0);
  const averageDelay = delayed.length
    ? delayed.reduce((sum, event) => sum + (event.delayDays ?? 0), 0) / delayed.length
    : 0;
  return {
    activeKnowledgeCount: state.knowledgePoints.filter((point) =>
      point.status === "active" || point.status === "overdue",
    ).length,
    averageDelay,
    completedToday,
    delayedReviewCount: delayed.length,
    dueTodayCount: dueToday.length,
    masteredCount: state.knowledgePoints.filter((point) => point.status === "mastered").length,
    maxOverdueDays: overdue.reduce((max, item) => Math.max(max, item.overdueDays), 0),
    onTimeRate: completedEvents.length ? onTime / completedEvents.length : 1,
    overdueCount: overdue.length,
    totalActionableToday: completedToday + overdue.length + dueToday.length,
    weeklyOutputs,
  };
}

export function getNiaReviewMessage(
  state: OutputReviewState,
  today = toLocalDateKey(new Date()),
  hour = new Date().getHours(),
): string {
  const metrics = getDashboardMetrics(state, today);
  const oldest = getReviewQueue(state, today).find((item) => item.urgency === "overdue");
  if (metrics.overdueCount >= 5) {
    return `你有 ${metrics.overdueCount} 项输出复习逾期。先停止扩张队列，从最早的一项开始清理。`;
  }
  if (oldest && oldest.overdueDays >= 4) {
    return `“${oldest.knowledgePoint.title}”的复习周期已严重偏离计划。先完成这项逾期输出，再新增知识点。`;
  }
  if (oldest && oldest.overdueDays >= 2) {
    return `“${oldest.knowledgePoint.title}”已延迟 ${oldest.overdueDays} 天。1/2/4/7 节奏依赖真实执行，请优先处理。`;
  }
  if (oldest) {
    return `“${oldest.knowledgePoint.title}”已逾期 1 天。今天完成它，不要继续累积复习债务。`;
  }
  if (metrics.dueTodayCount > 0 && hour >= 18) {
    return `今天还有 ${metrics.dueTodayCount} 项输出复习未完成。不要把全部任务留到一天结束。`;
  }
  if (metrics.dueTodayCount > 0) {
    return `今天有 ${metrics.dueTodayCount} 项输出复习。按计划完成最早的一项。`;
  }
  return "当前没有到期任务。复习节奏清晰，可以查看接下来的安排。";
}

export function getProjectStats(state: OutputReviewState, projectId: string) {
  const points = state.knowledgePoints.filter(
    (point) => point.projectId === projectId && point.status !== "archived",
  );
  const mastered = points.filter((point) => point.status === "mastered").length;
  return {
    active: points.filter((point) => point.status === "active").length,
    mastered,
    overdue: points.filter((point) => point.status === "overdue").length,
    paused: points.filter((point) => point.status === "paused").length,
    progress: points.length ? mastered / points.length : 0,
    total: points.length,
  };
}
