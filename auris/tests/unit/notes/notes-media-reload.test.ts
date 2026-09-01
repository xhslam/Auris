import { describe, expect, it, vi } from "vitest";
import {
  bumpNotesMediaReloadKey,
  getNotesMediaReloadKey,
  resetNotesMediaReloadKeyForTests,
  subscribeNotesMediaReloadKey,
} from "@/features/notes/editor/notes-media-reload";

describe("notes media reload key", () => {
  it("publishes a monotonic version for external vault changes", () => {
    resetNotesMediaReloadKeyForTests();
    const listener = vi.fn();
    const unsubscribe = subscribeNotesMediaReloadKey(listener);

    expect(getNotesMediaReloadKey()).toBe(0);
    expect(bumpNotesMediaReloadKey()).toBe(1);
    expect(bumpNotesMediaReloadKey()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    bumpNotesMediaReloadKey();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
