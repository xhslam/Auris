export const HOME_STORAGE_KEY = "auris:home:v1";

export type LifeNodeRecord = {
  year: number;
  text: string;
  updatedAt: string;
};

export type PlanItem = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyQuote = {
  date: string;
  text: string;
  updatedAt: string;
};

export type HomeData = {
  birthYear: number;
  lifeRecords: LifeNodeRecord[];
  plans: PlanItem[];
  quote: DailyQuote;
};

/** 默认岁数：21 岁（用户设定，可在「人生阶段」里随时改）。 */
export const DEFAULT_CURRENT_AGE = 21;
const MIN_BIRTH_YEAR = 1900;

export function clampBirthYear(birthYear: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  // 至少 1 岁、最多设到 1900 年出生。
  return Math.max(MIN_BIRTH_YEAR, Math.min(currentYear - 1, Math.round(birthYear)));
}

export const DEFAULT_DAILY_QUOTE =
  "真正的自由，是专注自己的热爱，并把它做到极致。";

export function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function createDefaultHomeData(now = new Date()): HomeData {
  const isoNow = now.toISOString();

  return {
    birthYear: now.getFullYear() - DEFAULT_CURRENT_AGE,
    lifeRecords: [],
    plans: [],
    quote: {
      date: toLocalDateKey(now),
      text: DEFAULT_DAILY_QUOTE,
      updatedAt: isoNow,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLifeRecord(value: unknown): LifeNodeRecord | null {
  if (!isObject(value)) {
    return null;
  }

  const { text, updatedAt, year } = value;

  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    typeof text !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return {
    year,
    text,
    updatedAt,
  };
}

function normalizePlan(value: unknown): PlanItem | null {
  if (!isObject(value)) {
    return null;
  }

  const { createdAt, done, id, title, updatedAt } = value;

  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof done !== "boolean" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    title,
    done,
    createdAt,
    updatedAt,
  };
}

function normalizeQuote(value: unknown, fallback: DailyQuote): DailyQuote {
  if (!isObject(value)) {
    return fallback;
  }

  const { date, text, updatedAt } = value;

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof text !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return fallback;
  }

  return {
    date,
    text,
    updatedAt,
  };
}

export function normalizeHomeData(value: unknown, now = new Date()): HomeData {
  const fallback = createDefaultHomeData(now);

  if (!isObject(value)) {
    return fallback;
  }

  const lifeRecords = Array.isArray(value.lifeRecords)
    ? value.lifeRecords.flatMap((item) => {
        const record = normalizeLifeRecord(item);
        return record ? [record] : [];
      })
    : [];

  const plans = Array.isArray(value.plans)
    ? value.plans.flatMap((item) => {
        const plan = normalizePlan(item);
        return plan ? [plan] : [];
      })
    : [];

  const birthYear =
    typeof value.birthYear === "number" &&
    Number.isFinite(value.birthYear) &&
    value.birthYear >= MIN_BIRTH_YEAR &&
    value.birthYear <= now.getFullYear() - 1
      ? Math.round(value.birthYear)
      : fallback.birthYear;

  return {
    birthYear,
    lifeRecords,
    plans,
    quote: normalizeQuote(value.quote, fallback.quote),
  };
}

export function readHomeData(storage: Pick<Storage, "getItem"> | null, now = new Date()) {
  if (!storage) {
    return createDefaultHomeData(now);
  }

  try {
    const rawValue = storage.getItem(HOME_STORAGE_KEY);
    return rawValue ? normalizeHomeData(JSON.parse(rawValue), now) : createDefaultHomeData(now);
  } catch {
    return createDefaultHomeData(now);
  }
}

export function writeHomeData(
  storage: Pick<Storage, "setItem"> | null,
  data: HomeData,
) {
  if (!storage) {
    return;
  }

  storage.setItem(HOME_STORAGE_KEY, JSON.stringify(normalizeHomeData(data)));
}

export function getBrowserHomeStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
