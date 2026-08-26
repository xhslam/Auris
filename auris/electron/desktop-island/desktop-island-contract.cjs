const MAX_TASK_ITEMS = 3;
const MAX_REVIEW_ITEMS = 1;
const MAX_TEXT_LENGTH = 120;
const MAX_ID_LENGTH = 128;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function boundedString(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") throw new TypeError("Expected string");
  const result = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!result || result.length > maxLength) throw new TypeError("Invalid bounded string");
  return result;
}

function boundedInteger(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError("Invalid bounded integer");
  }
  return value;
}

function percentage(value, nullable = false) {
  if (nullable && value === null) return null;
  return boundedInteger(value, 0, 100);
}

function normalizeTask(item) {
  if (!exactKeys(item, ["done", "id", "title"])) throw new TypeError("Invalid task item");
  if (typeof item.done !== "boolean") throw new TypeError("Invalid task completion state");
  return {
    done: item.done,
    id: boundedString(item.id, MAX_ID_LENGTH),
    title: boundedString(item.title),
  };
}

function normalizeReviewItem(item) {
  const keys = [
    "estimatedMinutes", "knowledgePointId", "overdueDays", "plannedDate",
    "projectName", "stageLabel", "title", "urgency",
  ];
  if (!exactKeys(item, keys)) throw new TypeError("Invalid review item");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate)) throw new TypeError("Invalid review date");
  if (item.urgency !== "overdue" && item.urgency !== "today") {
    throw new TypeError("Invalid review urgency");
  }
  return {
    estimatedMinutes: boundedInteger(item.estimatedMinutes, 1, 240),
    knowledgePointId: boundedString(item.knowledgePointId, MAX_ID_LENGTH),
    overdueDays: boundedInteger(item.overdueDays, 0, 3650),
    plannedDate: item.plannedDate,
    projectName: boundedString(item.projectName),
    stageLabel: boundedString(item.stageLabel, 32),
    title: boundedString(item.title),
    urgency: item.urgency,
  };
}

function normalizeDesktopIslandSnapshot(value) {
  if (!exactKeys(value, ["dateKey", "generatedAt", "review", "tasks", "version"])) {
    throw new TypeError("Invalid desktop island snapshot");
  }
  if (value.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateKey)) {
    throw new TypeError("Unsupported desktop island snapshot");
  }
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new TypeError("Invalid snapshot timestamp");
  }
  const taskKeys = ["completed", "items", "progressPercent", "remaining", "total"];
  if (!exactKeys(value.tasks, taskKeys) || !Array.isArray(value.tasks.items)) {
    throw new TypeError("Invalid task summary");
  }
  const total = boundedInteger(value.tasks.total, 0, 100_000);
  const completed = boundedInteger(value.tasks.completed, 0, total);
  const remaining = boundedInteger(value.tasks.remaining, 0, total);
  if (completed + remaining !== total || value.tasks.items.length > MAX_TASK_ITEMS) {
    throw new TypeError("Inconsistent task summary");
  }
  const tasks = value.tasks.items.map(normalizeTask);
  if (new Set(tasks.map((item) => item.id)).size !== tasks.length) {
    throw new TypeError("Duplicate task id");
  }

  const reviewKeys = [
    "actionableCount", "completedToday", "dueTodayCount", "items",
    "overdueCount", "progressPercent",
  ];
  if (!exactKeys(value.review, reviewKeys) || !Array.isArray(value.review.items)) {
    throw new TypeError("Invalid review summary");
  }
  const actionableCount = boundedInteger(value.review.actionableCount, 0, 100_000);
  const overdueCount = boundedInteger(value.review.overdueCount, 0, actionableCount);
  const dueTodayCount = boundedInteger(value.review.dueTodayCount, 0, actionableCount);
  if (overdueCount + dueTodayCount > actionableCount || value.review.items.length > MAX_REVIEW_ITEMS) {
    throw new TypeError("Inconsistent review summary");
  }

  return {
    dateKey: value.dateKey,
    generatedAt: new Date(value.generatedAt).toISOString(),
    review: {
      actionableCount,
      completedToday: boundedInteger(value.review.completedToday, 0, 100_000),
      dueTodayCount,
      items: value.review.items.map(normalizeReviewItem),
      overdueCount,
      progressPercent: percentage(value.review.progressPercent, true),
    },
    tasks: {
      completed,
      items: tasks,
      progressPercent: percentage(value.tasks.progressPercent),
      remaining,
      total,
    },
    version: 1,
  };
}

function normalizeDesktopIslandSettings(value, fallback = {}) {
  const source = isRecord(value) ? value : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : Boolean(fallback.enabled),
    expandOnHover: typeof source.expandOnHover === "boolean"
      ? source.expandOnHover
      : fallback.expandOnHover !== false,
    privacyMode: typeof source.privacyMode === "boolean"
      ? source.privacyMode
      : Boolean(fallback.privacyMode),
  };
}

function semanticSnapshotFingerprint(snapshot) {
  const { generatedAt: _generatedAt, ...semantic } = snapshot;
  return JSON.stringify(semantic);
}

module.exports = {
  MAX_ID_LENGTH,
  normalizeDesktopIslandSettings,
  normalizeDesktopIslandSnapshot,
  semanticSnapshotFingerprint,
};
