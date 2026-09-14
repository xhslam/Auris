import { describe, expect, it } from "vitest";
import {
  DEFAULT_NIA_COMPANION_SCALE,
  MAX_NIA_COMPANION_SCALE,
  MIN_NIA_COMPANION_SCALE,
  loadNiaCompanionScale,
  normalizeNiaCompanionScale,
  saveNiaCompanionScale,
} from "@/features/nia/nia-companion-scale";

describe("Nia companion scale preference", () => {
  it("normalizes invalid and out-of-range values without affecting other settings", () => {
    expect(normalizeNiaCompanionScale(undefined)).toBe(DEFAULT_NIA_COMPANION_SCALE);
    expect(normalizeNiaCompanionScale("not-a-number")).toBe(DEFAULT_NIA_COMPANION_SCALE);
    expect(normalizeNiaCompanionScale(20)).toBe(MIN_NIA_COMPANION_SCALE);
    expect(normalizeNiaCompanionScale(200)).toBe(MAX_NIA_COMPANION_SCALE);
    expect(normalizeNiaCompanionScale(83)).toBe(85);
  });

  it("persists and reloads only the companion scale", () => {
    window.localStorage.setItem("unrelated-setting", "kept");

    saveNiaCompanionScale(75);

    expect(loadNiaCompanionScale()).toBe(75);
    expect(window.localStorage.getItem("unrelated-setting")).toBe("kept");
  });
});
