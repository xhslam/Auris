import { describe, expect, it } from "vitest";

import {
  NIA_HISTORY_RECORDS_KEY,
  appendNiaHistory,
  loadNiaHistory,
  setNiaHistoryEnabled,
} from "@/features/nia/nia-history";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe("Nia opt-in history", () => {
  it("stores no conversation until explicitly enabled and deletes it when disabled", () => {
    const storage = memoryStorage();
    appendNiaHistory(storage, {
      id: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "secret prompt",
      response: "answer",
    });
    expect(storage.values.has(NIA_HISTORY_RECORDS_KEY)).toBe(false);

    setNiaHistoryEnabled(storage, true);
    appendNiaHistory(storage, {
      id: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "prompt",
      response: "answer",
    });
    expect(loadNiaHistory(storage)).toHaveLength(1);
    setNiaHistoryEnabled(storage, false);
    expect(loadNiaHistory(storage)).toEqual([]);
    expect(storage.values.has(NIA_HISTORY_RECORDS_KEY)).toBe(false);
  });
});
