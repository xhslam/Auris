/**
 * 更新检查偏好（localStorage）。
 *
 * 对齐 vmark `src/stores/settingsTypes/workspace.ts` 的 `UpdateSettings` 与
 * `settingsStore/defaults.ts` 的默认值，字段与语义一一对应：
 *
 * | vmark                  | 这里                   |
 * |------------------------|------------------------|
 * | autoCheckEnabled: true | autoCheckEnabled: true |
 * | checkFrequency:"startup"| checkFrequency:"startup"|
 * | autoDownload: false    | autoDownload: false    |
 * | lastCheckTimestamp     | lastCheckTimestamp     |
 * | skipVersion            | skipVersion            |
 *
 * 落地方式按 Auris 惯例走 localStorage + CustomEvent 广播（同
 * `notes-typography.ts`），而不是引入一套 vmark 的 zustand persist——Auris
 * 没有全局 settingsStore，为四个字段新建一套持久化中间件属于反向对齐。
 */

/** 检查频率。语义与 vmark `UpdateCheckFrequency` 相同。 */
export type UpdateCheckFrequency = "startup" | "daily" | "weekly" | "manual";

export interface UpdateSettings {
  /** 是否周期性检查更新。 */
  autoCheckEnabled: boolean;
  /** 何时检查。 */
  checkFrequency: UpdateCheckFrequency;
  /** 发现更新后是否自动下载。 */
  autoDownload: boolean;
  /** 上次检查的 Unix 毫秒时间戳；null = 从未检查。 */
  lastCheckTimestamp: number | null;
  /** 用户选择跳过的版本号。 */
  skipVersion: string | null;
}

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoCheckEnabled: true,
  autoDownload: false,
  checkFrequency: "startup",
  lastCheckTimestamp: null,
  skipVersion: null,
};

const STORAGE_KEY = "auris.updates.settings";

/** 同文档内广播设置变更，让已挂载的指示器/设置卡片立即跟随。 */
export const UPDATE_SETTINGS_EVENT = "auris:update-settings";

/**
 * 频率选项的规范顺序。设置页把它当作循环列表（点一次进下一个），所以顺序
 * 本身是 UI 语义：由「最频繁」到「不检查」单向递减。
 */
export const UPDATE_CHECK_FREQUENCIES: readonly UpdateCheckFrequency[] = [
  "startup",
  "daily",
  "weekly",
  "manual",
];

export function isUpdateCheckFrequency(value: unknown): value is UpdateCheckFrequency {
  return (
    typeof value === "string" &&
    UPDATE_CHECK_FREQUENCIES.includes(value as UpdateCheckFrequency)
  );
}

function sanitize(parsed: Partial<UpdateSettings> | null | undefined): UpdateSettings {
  if (!parsed || typeof parsed !== "object") {
    return DEFAULT_UPDATE_SETTINGS;
  }

  return {
    autoCheckEnabled:
      typeof parsed.autoCheckEnabled === "boolean"
        ? parsed.autoCheckEnabled
        : DEFAULT_UPDATE_SETTINGS.autoCheckEnabled,
    autoDownload:
      typeof parsed.autoDownload === "boolean"
        ? parsed.autoDownload
        : DEFAULT_UPDATE_SETTINGS.autoDownload,
    checkFrequency: isUpdateCheckFrequency(parsed.checkFrequency)
      ? parsed.checkFrequency
      : DEFAULT_UPDATE_SETTINGS.checkFrequency,
    lastCheckTimestamp:
      typeof parsed.lastCheckTimestamp === "number" &&
      Number.isFinite(parsed.lastCheckTimestamp)
        ? parsed.lastCheckTimestamp
        : null,
    skipVersion:
      typeof parsed.skipVersion === "string" && parsed.skipVersion
        ? parsed.skipVersion
        : null,
  };
}

export function loadUpdateSettings(): UpdateSettings {
  if (typeof window === "undefined") {
    return DEFAULT_UPDATE_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_UPDATE_SETTINGS;
    }
    return sanitize(JSON.parse(raw) as Partial<UpdateSettings>);
  } catch {
    return DEFAULT_UPDATE_SETTINGS;
  }
}

export function saveUpdateSettings(settings: UpdateSettings): UpdateSettings {
  const next = sanitize(settings);

  if (typeof window === "undefined") {
    return next;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 配额/隐私模式写入失败不阻塞，内存态仍然生效。
  }

  window.dispatchEvent(
    new CustomEvent<UpdateSettings>(UPDATE_SETTINGS_EVENT, { detail: next }),
  );
  return next;
}

export function updateUpdateSetting<K extends keyof UpdateSettings>(
  key: K,
  value: UpdateSettings[K],
): UpdateSettings {
  return saveUpdateSettings({ ...loadUpdateSettings(), [key]: value });
}

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

/**
 * 是否该现在检查更新——逐条移植 vmark `useUpdateChecker.shouldCheckNow`。
 *
 * 判定顺序（与 vmark 一致，顺序本身是语义）：关掉自动检查 → 否；manual → 否；
 * startup → 是；从未检查过 → 是；否则按 daily/weekly 比较间隔。
 */
export function shouldCheckNow(
  autoCheckEnabled: boolean,
  frequency: UpdateCheckFrequency,
  lastCheckTimestamp: number | null,
  now: number = Date.now(),
): boolean {
  if (!autoCheckEnabled) return false;
  if (frequency === "manual") return false;
  if (frequency === "startup") return true;
  if (!lastCheckTimestamp) return true;

  const elapsed = now - lastCheckTimestamp;

  if (frequency === "daily") return elapsed >= ONE_DAY;
  if (frequency === "weekly") return elapsed >= ONE_WEEK;

  return false;
}
