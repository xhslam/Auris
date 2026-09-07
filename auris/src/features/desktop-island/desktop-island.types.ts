export type DesktopIslandPresentation = "hidden" | "compact" | "expanded";
export type DesktopIslandPlacement = "top" | "right" | "bottom" | "left";

export type DesktopIslandTaskItem = Readonly<{
  done: boolean;
  id: string;
  title: string;
}>;

export type DesktopIslandReviewItem = Readonly<{
  estimatedMinutes: number;
  knowledgePointId: string;
  overdueDays: number;
  plannedDate: string;
  projectName: string;
  stageLabel: string;
  title: string;
  urgency: "overdue" | "today";
}>;

export type DesktopIslandContentSnapshot = Readonly<{
  dateKey: string;
  generatedAt: string;
  review: Readonly<{
    actionableCount: number;
    completedToday: number;
    dueTodayCount: number;
    items: readonly DesktopIslandReviewItem[];
    overdueCount: number;
    progressPercent: number | null;
  }>;
  tasks: Readonly<{
    completed: number;
    items: readonly DesktopIslandTaskItem[];
    progressPercent: number;
    remaining: number;
    total: number;
  }>;
  version: 1;
}>;

export type DesktopIslandSettings = Readonly<{
  enabled: boolean;
  expandOnHover: boolean;
  placement: DesktopIslandPlacement;
  privacyMode: boolean;
}>;

export type DesktopIslandRendererIntent =
  | Readonly<{
      actionId: string;
      done: boolean;
      name: "set-task-done";
      taskId: string;
    }>;

export type DesktopIslandSyncResult = Readonly<{
  accepted: boolean;
  revision: number;
}>;
