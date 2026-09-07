import { beforeEach, describe, expect, it } from "vitest";
import {
  claimSaveTarget,
  forgetSaveTarget,
  invalidateSaveTarget,
  isCurrentSaveTarget,
  resetSaveTargetClaims,
} from "@/features/notes/persistence/save-target-claim";

describe("save-target-claim", () => {
  beforeEach(() => {
    resetSaveTargetClaims();
  });

  it("identifies the sole claim as current", () => {
    const claim = claimSaveTarget("docs/note.md");
    expect(isCurrentSaveTarget(claim)).toBe(true);
  });

  it("invalidates an older claim when a newer claim is taken for the same path", () => {
    const claim1 = claimSaveTarget("docs/note.md");
    const claim2 = claimSaveTarget("docs/note.md");

    expect(isCurrentSaveTarget(claim1)).toBe(false);
    expect(isCurrentSaveTarget(claim2)).toBe(true);
  });

  it("invalidates an in-flight claim explicitly on rename/deletion", () => {
    const claim = claimSaveTarget("docs/note.md");
    expect(isCurrentSaveTarget(claim)).toBe(true);

    invalidateSaveTarget("docs/note.md");
    expect(isCurrentSaveTarget(claim)).toBe(false);
  });

  it("handles multiple distinct document paths independently", () => {
    const claimA = claimSaveTarget("docs/a.md");
    const claimB = claimSaveTarget("docs/b.md");

    invalidateSaveTarget("docs/a.md");
    expect(isCurrentSaveTarget(claimA)).toBe(false);
    expect(isCurrentSaveTarget(claimB)).toBe(true);
  });

  it("cleans up forgotten claims", () => {
    const claim = claimSaveTarget("docs/note.md");
    forgetSaveTarget("docs/note.md");
    expect(isCurrentSaveTarget(claim)).toBe(false);
  });
});
