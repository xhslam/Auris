export const NIA_HISTORY_SETTINGS_KEY = "auris.nia.history.settings.v1";
export const NIA_HISTORY_RECORDS_KEY = "auris.nia.history.records.v1";
export const NIA_HISTORY_LIMIT = 50;

export type NiaHistoryRecord = Readonly<{
  id: string;
  createdAt: string;
  prompt: string;
  response: string;
  providerId?: string;
  model?: string;
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isNiaHistoryEnabled(storage: StorageLike | null) {
  if (!storage) return false;
  return safeParse<{ enabled?: boolean }>(storage.getItem(NIA_HISTORY_SETTINGS_KEY), {}).enabled === true;
}

export function setNiaHistoryEnabled(storage: StorageLike | null, enabled: boolean) {
  if (!storage) return false;
  storage.setItem(NIA_HISTORY_SETTINGS_KEY, JSON.stringify({ enabled }));
  if (!enabled) storage.removeItem(NIA_HISTORY_RECORDS_KEY);
  return enabled;
}

export function loadNiaHistory(storage: StorageLike | null): NiaHistoryRecord[] {
  if (!storage || !isNiaHistoryEnabled(storage)) return [];
  const value = safeParse<unknown>(storage.getItem(NIA_HISTORY_RECORDS_KEY), []);
  if (!Array.isArray(value)) return [];
  return value
    .filter((record): record is NiaHistoryRecord => Boolean(
      record && typeof record === "object" &&
      typeof (record as NiaHistoryRecord).id === "string" &&
      typeof (record as NiaHistoryRecord).prompt === "string" &&
      typeof (record as NiaHistoryRecord).response === "string",
    ))
    .slice(0, NIA_HISTORY_LIMIT);
}

export function appendNiaHistory(storage: StorageLike | null, record: NiaHistoryRecord) {
  if (!storage || !isNiaHistoryEnabled(storage)) return [];
  const sanitized = Object.freeze({
    ...record,
    prompt: record.prompt.slice(0, 32_000),
    response: record.response.slice(0, 32_000),
  });
  const records = [sanitized, ...loadNiaHistory(storage).filter((entry) => entry.id !== record.id)]
    .slice(0, NIA_HISTORY_LIMIT);
  storage.setItem(NIA_HISTORY_RECORDS_KEY, JSON.stringify(records));
  return records;
}
