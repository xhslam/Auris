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
  durationMinutes?: number;
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

export type CompletedReviewEventItem = {
  event: ReviewEvent;
  point: KnowledgePoint;
  project?: OutputReviewProject;
  completionDate: string;
};

export type ReviewHeatmapMode = "day" | "week" | "cumulative";
export type HeatmapMetricDimension = "count" | "duration";

export type ReviewHeatmapCell = {
  date: string;
  count: number;
  durationMinutes: number;
  cumulativeCount: number;
  cumulativeDurationMinutes: number;
  weekday: number;
  weekIndex: number;
  level: number;
  durationLevel: number;
};

export type ReviewHeatmapWeek = {
  index: number;
  rangeStart: string;
  rangeEnd: string;
  totalCount: number;
  totalDurationMinutes: number;
  level: number;
  durationLevel: number;
};

export type ReviewHeatmapMonthMarker = {
  weekIndex: number;
  label: string;
};

export type ReviewHeatmapMonthSegment = {
  key: string;
  weeks: number;
  label: string;
};

export type ReviewInsightLeverage = {
  title: string;
  hasSufficientData: boolean;
  summary: string;
  topProjectName?: string;
  masteredCount?: number;
};

export type ReviewInsightStubborn = {
  title: string;
  hasStubbornPoints: boolean;
  summary: string;
  count: number;
  points: Array<{ id: string; title: string; delayDays: number }>;
};

export type ReviewInsightDurationTrend = {
  title: string;
  diffMinutes: number;
  diffReviews: number;
  direction: "up" | "down" | "flat" | "none";
  summary: string;
  latestMinutes: number;
  previousMinutes: number;
  latestReviews: number;
  previousReviews: number;
  thisWeekMinutes: number;
  lastWeekMinutes: number;
};

export type ReviewInsightTimeSlot = {
  label: string;
  count: number;
  percentage: number;
};

export type ReviewInsightTimeDistribution = {
  title: string;
  peakPeriod: "dawn" | "morning" | "afternoon" | "evening" | "night" | "none";
  summary: string;
  slots: ReviewInsightTimeSlot[];
};

export type ReviewInsights = {
  leverage: ReviewInsightLeverage;
  stubborn: ReviewInsightStubborn;
  durationTrend: ReviewInsightDurationTrend;
  timeDistribution: ReviewInsightTimeDistribution;
};

export type ReviewHeatmapModel = {
  cells: ReviewHeatmapCell[];
  weeks: ReviewHeatmapWeek[];
  monthMarkers: ReviewHeatmapMonthMarker[];
  monthSegments: ReviewHeatmapMonthSegment[];
  totalReviews: number;
  totalDurationMinutes: number;
  studiedDayCount: number;
  averageDailyReviews: number;
  averageDailyMinutes: number;
  peakDailyReviews: number;
  peakDailyMinutes: number;
  peakWeeklyReviews: number;
  peakWeeklyMinutes: number;
  currentStreak: number;
  longestStreak: number;
  streak: number;
  insights: ReviewInsights;
  eventsByDate: Map<string, CompletedReviewEventItem[]>;
  eventsByWeek: Map<number, CompletedReviewEventItem[]>;
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export function epochDayFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY);
}

export function dateKeyFromEpochDay(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function mondayBasedWeekday(epochDay: number): number {
  const weekday = (epochDay + 3) % DAYS_PER_WEEK;
  return weekday >= 0 ? weekday : weekday + DAYS_PER_WEEK;
}

export function formatChineseDateOnly(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function reviewActivityLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function getCompletedReviewEvents(state: OutputReviewState): CompletedReviewEventItem[] {
  const result: CompletedReviewEventItem[] = [];
  const pointMap = new Map(state.knowledgePoints.map((p) => [p.id, p]));
  const projectMap = new Map(state.projects.map((pr) => [pr.id, pr]));

  for (const cycle of state.cycles) {
    const point = pointMap.get(cycle.knowledgePointId);
    if (!point || point.status === "archived") continue;
    const project = point.projectId ? projectMap.get(point.projectId) : undefined;

    for (const event of cycle.events) {
      if (event.status === "completed") {
        const completionDate = event.completedAt
          ? toLocalDateKey(new Date(event.completedAt))
          : event.currentPlannedDate;
        result.push({
          event,
          point,
          project,
          completionDate,
        });
      }
    }
  }

  return result.sort((a, b) => {
    const timeA = a.event.completedAt ?? a.event.currentPlannedDate;
    const timeB = b.event.completedAt ?? b.event.currentPlannedDate;
    return timeB.localeCompare(timeA);
  });
}

export function getEventDurationMinutes(event: ReviewEvent): number {
  if (typeof event.durationMinutes === "number" && event.durationMinutes > 0) {
    return event.durationMinutes;
  }
  switch (event.stage) {
    case "day1":
      return 5;
    case "day2":
      return 3;
    case "day4":
      return 4;
    case "day7":
      return 6;
    default:
      return 5;
  }
}

export function calculateReviewStreak(
  reviewsByDate: Map<string, CompletedReviewEventItem[]>,
  todayKey: string,
): number {
  let streak = 0;
  const todayItems = reviewsByDate.get(todayKey);
  let checkEpoch = epochDayFromDateKey(todayKey);

  if (!todayItems || todayItems.length === 0) {
    checkEpoch -= 1;
  }

  while (true) {
    const key = dateKeyFromEpochDay(checkEpoch);
    const items = reviewsByDate.get(key);
    if (items && items.length > 0) {
      streak += 1;
      checkEpoch -= 1;
    } else {
      break;
    }
  }

  return streak;
}

export function calculateLongestStreak(
  reviewsByDate: Map<string, CompletedReviewEventItem[]>,
  currentStreak = 0,
): number {
  const dates = Array.from(reviewsByDate.keys()).filter((dateKey) => {
    const items = reviewsByDate.get(dateKey);
    return items && items.length > 0;
  });
  if (dates.length === 0) return currentStreak;

  const epochDays = Array.from(new Set(dates.map((d) => epochDayFromDateKey(d)))).sort(
    (a, b) => a - b,
  );

  let maxStreak = 0;
  let running = 0;
  let prev = -999999;

  for (const day of epochDays) {
    if (day === prev + 1) {
      running += 1;
    } else {
      running = 1;
    }
    prev = day;
    if (running > maxStreak) {
      maxStreak = running;
    }
  }

  return Math.max(maxStreak, currentStreak);
}

export function buildReviewInsights(
  state: OutputReviewState,
  completedEvents: CompletedReviewEventItem[],
  todayKey = toLocalDateKey(new Date()),
): ReviewInsights {
  // 1. Leverage (词根杠杆)
  const masteredCountByProject = new Map<string, number>();
  for (const point of state.knowledgePoints) {
    if (point.status === "archived") continue;
    const isMastered = point.status === "mastered";
    const hasCompletedDay7 = state.cycles.some(
      (c) =>
        c.knowledgePointId === point.id &&
        c.events.some((e) => e.stage === "day7" && e.status === "completed"),
    );
    if (isMastered || hasCompletedDay7) {
      const pId = point.projectId || "unassigned";
      masteredCountByProject.set(pId, (masteredCountByProject.get(pId) ?? 0) + 1);
    }
  }

  let topProjectId: string | null = null;
  let topProjectMasteredCount = 0;
  for (const [pId, count] of masteredCountByProject.entries()) {
    if (count > topProjectMasteredCount) {
      topProjectMasteredCount = count;
      topProjectId = pId;
    }
  }

  const topProject = topProjectId ? state.projects.find((p) => p.id === topProjectId) : undefined;
  const leverageHasSufficient = topProjectMasteredCount >= 3;
  const leverageSummary = leverageHasSufficient
    ? `已掌握 ${topProjectMasteredCount} 个知识点 · 核心项目「${topProject?.name ?? "默认项目"}」`
    : "还没有项目掌握满 3 个知识点";

  // 2. Stubborn (顽固词)
  const stubbornPoints: Array<{ id: string; title: string; delayDays: number }> = [];
  for (const point of state.knowledgePoints) {
    if (point.status === "archived") continue;
    let maxDelay = 0;
    const cycles = state.cycles.filter((c) => c.knowledgePointId === point.id);
    for (const c of cycles) {
      for (const e of c.events) {
        if ((e.delayDays ?? 0) > maxDelay) {
          maxDelay = e.delayDays ?? 0;
        }
      }
    }
    const hasMultipleCycles = cycles.length > 1;
    if (maxDelay >= 2 || hasMultipleCycles) {
      stubbornPoints.push({
        id: point.id,
        title: point.title,
        delayDays: maxDelay,
      });
    }
  }

  const hasStubborn = stubbornPoints.length > 0;
  const stubbornSummary = hasStubborn
    ? `${stubbornPoints.length} 个知识点曾延期至少 2 天或重复开启复习`
    : "暂无待巩固知识点";

  // 3. Duration & rhythm change (时长变化)
  const datesWithReviews: string[] = [];
  const dateMinutesMap = new Map<string, number>();
  const dateCountsMap = new Map<string, number>();

  for (const item of completedEvents) {
    const d = item.completionDate;
    const currentMins = dateMinutesMap.get(d) ?? 0;
    const currentCount = dateCountsMap.get(d) ?? 0;
    const itemMins = getEventDurationMinutes(item.event);
    dateMinutesMap.set(d, currentMins + itemMins);
    dateCountsMap.set(d, currentCount + 1);
    if (!datesWithReviews.includes(d)) {
      datesWithReviews.push(d);
    }
  }

  datesWithReviews.sort((a, b) => b.localeCompare(a));

  const latestDate = datesWithReviews[0];
  const previousDate = datesWithReviews[1];

  let diffMinutes = 0;
  let diffReviews = 0;
  let durationDirection: "up" | "down" | "flat" | "none" = "none";
  let durationSummary = "暂无对比数据";
  const latestMinutes = latestDate ? (dateMinutesMap.get(latestDate) ?? 0) : 0;
  const previousMinutes = previousDate ? (dateMinutesMap.get(previousDate) ?? 0) : 0;
  const latestReviews = latestDate ? (dateCountsMap.get(latestDate) ?? 0) : 0;
  const previousReviews = previousDate ? (dateCountsMap.get(previousDate) ?? 0) : 0;

  if (latestDate && previousDate) {
    diffMinutes = latestMinutes - previousMinutes;
    diffReviews = latestReviews - previousReviews;
    if (diffMinutes > 0) {
      durationDirection = "up";
      durationSummary = `比上一次 多 ${diffMinutes} 分钟 ↗`;
    } else if (diffMinutes < 0) {
      durationDirection = "down";
      durationSummary = `比上一次 少 ${Math.abs(diffMinutes)} 分钟 ↘`;
    } else {
      durationDirection = "flat";
      durationSummary = `与上一次 持平 · 保持节奏`;
    }
  } else if (latestDate) {
    durationSummary = `首次复盘完成 · 暂无对比数据`;
    durationDirection = "flat";
  }

  const todayEpoch = epochDayFromDateKey(todayKey);
  const thisWeekStartEpoch = todayEpoch - mondayBasedWeekday(todayEpoch);
  const lastWeekStartEpoch = thisWeekStartEpoch - 7;

  let thisWeekMinutes = 0;
  let lastWeekMinutes = 0;

  for (const item of completedEvents) {
    const ep = epochDayFromDateKey(item.completionDate);
    const m = getEventDurationMinutes(item.event);
    if (ep >= thisWeekStartEpoch && ep < thisWeekStartEpoch + 7) {
      thisWeekMinutes += m;
    } else if (ep >= lastWeekStartEpoch && ep < thisWeekStartEpoch) {
      lastWeekMinutes += m;
    }
  }

  // 4. Time distribution (学习时段)
  let dawnCount = 0;
  let morningCount = 0;
  let afternoonCount = 0;
  let eveningCount = 0;
  let nightCount = 0;

  for (const item of completedEvents) {
    const timeStr = item.event.completedAt;
    if (!timeStr) {
      morningCount += 1;
      continue;
    }
    const hour = new Date(timeStr).getHours();
    if (hour >= 5 && hour < 9) dawnCount += 1;
    else if (hour >= 9 && hour < 12) morningCount += 1;
    else if (hour >= 12 && hour < 18) afternoonCount += 1;
    else if (hour >= 18 && hour < 23) eveningCount += 1;
    else nightCount += 1;
  }

  const totalTimeSlots = dawnCount + morningCount + afternoonCount + eveningCount + nightCount;
  const pct = (c: number) => (totalTimeSlots > 0 ? Math.round((c / totalTimeSlots) * 100) : 0);

  const slots: ReviewInsightTimeSlot[] = [
    { label: "清晨 (05-09点)", count: dawnCount, percentage: pct(dawnCount) },
    { label: "上午 (09-12点)", count: morningCount, percentage: pct(morningCount) },
    { label: "下午 (12-18点)", count: afternoonCount, percentage: pct(afternoonCount) },
    { label: "晚上 (18-23点)", count: eveningCount, percentage: pct(eveningCount) },
    { label: "深夜 (23-05点)", count: nightCount, percentage: pct(nightCount) },
  ];

  let peakPeriod: "dawn" | "morning" | "afternoon" | "evening" | "night" | "none" = "none";
  let timeSummary = "暂无时段数据 · 开启第一次复盘后记录";

  if (totalTimeSlots > 0) {
    const maxCount = Math.max(dawnCount, morningCount, afternoonCount, eveningCount, nightCount);
    if (maxCount === morningCount) {
      peakPeriod = "morning";
      timeSummary = "常在上午学 · 清晨回忆率最高";
    } else if (maxCount === dawnCount) {
      peakPeriod = "dawn";
      timeSummary = "常在清晨学 · 清晨回忆率最高";
    } else if (maxCount === afternoonCount) {
      peakPeriod = "afternoon";
      timeSummary = "常在下午学 · 下午专注平稳";
    } else if (maxCount === eveningCount) {
      peakPeriod = "evening";
      timeSummary = "常在晚上学 · 夜间复盘效率最高";
    } else {
      peakPeriod = "night";
      timeSummary = "常在深夜学 · 建议适当提前休息";
    }
  }

  return {
    leverage: {
      title: "项目掌握",
      hasSufficientData: leverageHasSufficient,
      summary: leverageSummary,
      topProjectName: topProject?.name,
      masteredCount: topProjectMasteredCount,
    },
    stubborn: {
      title: "待巩固",
      hasStubbornPoints: hasStubborn,
      summary: stubbornSummary,
      count: stubbornPoints.length,
      points: stubbornPoints,
    },
    durationTrend: {
      title: "时长变化",
      diffMinutes,
      diffReviews,
      direction: durationDirection,
      summary: durationSummary,
      latestMinutes,
      previousMinutes,
      latestReviews,
      previousReviews,
      thisWeekMinutes,
      lastWeekMinutes,
    },
    timeDistribution: {
      title: "学习时段",
      peakPeriod,
      summary: timeSummary,
      slots,
    },
  };
}

export function buildReviewHeatmapModel(
  state: OutputReviewState,
  endDateKey = toLocalDateKey(new Date()),
  daySpan = 365,
): ReviewHeatmapModel {
  const completedEvents = getCompletedReviewEvents(state).filter((item) => item.completionDate <= endDateKey);
  const eventsByDate = new Map<string, CompletedReviewEventItem[]>();

  for (const item of completedEvents) {
    const list = eventsByDate.get(item.completionDate) ?? [];
    list.push(item);
    eventsByDate.set(item.completionDate, list);
  }

  const endEpoch = epochDayFromDateKey(endDateKey);
  const startEpoch = endEpoch - (daySpan - 1);
  const firstWeekStart = startEpoch - mondayBasedWeekday(startEpoch);

  let cumulativeCount = 0;
  let dailyCountSum = 0;
  const cumulativePointIds = new Set<string>();
  let cumulativeDurationMinutes = 0;
  let peakDailyReviews = 0;
  let peakDailyMinutes = 0;
  let studiedDayCount = 0;

  const rawCells: Array<{
    date: string;
    count: number;
    durationMinutes: number;
    cumulativeCount: number;
    cumulativeDurationMinutes: number;
    weekday: number;
    weekIndex: number;
  }> = [];

  for (let ep = startEpoch; ep <= endEpoch; ep++) {
    const date = dateKeyFromEpochDay(ep);
    const weekday = mondayBasedWeekday(ep);
    const weekIndex = Math.floor((ep - firstWeekStart) / DAYS_PER_WEEK);
    const dayEvents = eventsByDate.get(date) ?? [];
    const count = new Set(dayEvents.map((item) => item.point.id)).size;
    const durationMinutes = dayEvents.reduce(
      (sum, item) => sum + getEventDurationMinutes(item.event),
      0,
    );

    if (count > 0) {
      studiedDayCount += 1;
      if (count > peakDailyReviews) {
        peakDailyReviews = count;
      }
      if (durationMinutes > peakDailyMinutes) {
        peakDailyMinutes = durationMinutes;
      }
    }

    dailyCountSum += count;
    dayEvents.forEach((item) => cumulativePointIds.add(item.point.id));
    cumulativeCount = cumulativePointIds.size;
    cumulativeDurationMinutes += durationMinutes;
    rawCells.push({
      date,
      count,
      durationMinutes,
      cumulativeCount,
      cumulativeDurationMinutes,
      weekday,
      weekIndex,
    });
  }

  const totalReviews = cumulativeCount;
  const totalDurationMinutes = cumulativeDurationMinutes;
  const lastWeekIndex = rawCells.at(-1)?.weekIndex ?? 0;
  const eventsByWeek = new Map<number, CompletedReviewEventItem[]>();

  let peakWeeklyReviews = 0;
  let peakWeeklyMinutes = 0;
  const weeks: ReviewHeatmapWeek[] = [];

  for (let index = 0; index <= lastWeekIndex; index++) {
    const weekCells = rawCells.filter((cell) => cell.weekIndex === index);
    const weekStart = firstWeekStart + index * DAYS_PER_WEEK;
    const rangeStart = weekCells[0]?.date ?? dateKeyFromEpochDay(weekStart);
    const rangeEnd = weekCells.at(-1)?.date ?? dateKeyFromEpochDay(weekStart + DAYS_PER_WEEK - 1);
    const totalCount = new Set(weekCells.flatMap((cell) => (eventsByDate.get(cell.date) ?? []).map((item) => item.point.id))).size;
    const totalDuration = weekCells.reduce((sum, cell) => sum + cell.durationMinutes, 0);

    if (totalCount > peakWeeklyReviews) {
      peakWeeklyReviews = totalCount;
    }
    if (totalDuration > peakWeeklyMinutes) {
      peakWeeklyMinutes = totalDuration;
    }

    const weekEvents: CompletedReviewEventItem[] = [];
    for (const cell of weekCells) {
      const cellEvents = eventsByDate.get(cell.date);
      if (cellEvents) weekEvents.push(...cellEvents);
    }
    eventsByWeek.set(index, weekEvents);

    weeks.push({
      index,
      rangeStart,
      rangeEnd,
      totalCount,
      totalDurationMinutes: totalDuration,
      level: 0,
      durationLevel: 0,
    });
  }

  for (const week of weeks) {
    week.level = reviewActivityLevel(week.totalCount, peakWeeklyReviews);
    week.durationLevel = reviewActivityLevel(week.totalDurationMinutes, peakWeeklyMinutes);
  }

  const cells: ReviewHeatmapCell[] = rawCells.map((cell) => ({
    ...cell,
    level: reviewActivityLevel(cell.count, peakDailyReviews),
    durationLevel: reviewActivityLevel(cell.durationMinutes, peakDailyMinutes),
  }));

  const monthMarkers: ReviewHeatmapMonthMarker[] = [];
  for (const cell of cells) {
    if (cell.date.slice(8, 10) === "01") {
      const monthNumber = Number(cell.date.slice(5, 7));
      const label = MONTH_LABELS[monthNumber - 1] ?? `${monthNumber}月`;
      monthMarkers.push({
        weekIndex: cell.weekIndex,
        label,
      });
    }
  }

  const monthSegments: ReviewHeatmapMonthSegment[] = [];
  const leadingWeeks = monthMarkers[0]?.weekIndex ?? 0;
  if (leadingWeeks > 0) {
    monthSegments.push({
      key: "lead",
      weeks: leadingWeeks,
      label: "",
    });
  }

  monthMarkers.forEach((marker, index) => {
    const nextWeekIndex = monthMarkers[index + 1]?.weekIndex ?? (lastWeekIndex + 1);
    monthSegments.push({
      key: `${marker.weekIndex}-${marker.label}`,
      weeks: Math.max(1, nextWeekIndex - marker.weekIndex),
      label: marker.label,
    });
  });

  const currentStreak = calculateReviewStreak(eventsByDate, endDateKey);
  const longestStreak = calculateLongestStreak(eventsByDate, currentStreak);
  const averageDailyReviews =
    studiedDayCount > 0 ? Math.round(dailyCountSum / studiedDayCount) : 0;
  const averageDailyMinutes =
    studiedDayCount > 0 ? Math.round(totalDurationMinutes / studiedDayCount) : 0;
  const insights = buildReviewInsights(state, completedEvents, endDateKey);

  return {
    cells,
    weeks,
    monthMarkers,
    monthSegments,
    totalReviews,
    totalDurationMinutes,
    studiedDayCount,
    averageDailyReviews,
    averageDailyMinutes,
    peakDailyReviews,
    peakDailyMinutes,
    peakWeeklyReviews,
    peakWeeklyMinutes,
    currentStreak,
    longestStreak,
    streak: currentStreak,
    insights,
    eventsByDate,
    eventsByWeek,
  };
}
