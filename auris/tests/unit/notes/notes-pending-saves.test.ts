import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAllPendingNoteSaves,
  clearPendingNoteSave,
  hasPendingNoteSave,
  matchesPendingNoteSave,
  registerPendingNoteSave,
} from "@/features/notes/workbench/notes-pending-saves";

describe("notes pending saves", () => {
  beforeEach(() => {
    clearAllPendingNoteSaves();
  });

  it("matches pending saves by normalized path and exact content", () => {
    registerPendingNoteSave("\\Inbox\\Daily.md", "# Draft");

    expect(hasPendingNoteSave("Inbox/Daily.md")).toBe(true);
    expect(matchesPendingNoteSave("Inbox/Daily.md", "# Draft")).toBe(true);
    expect(matchesPendingNoteSave("Inbox/Daily.md", "# External")).toBe(false);
  });

  it("uses tokens so an older save cannot clear a newer registration", () => {
    const older = registerPendingNoteSave("Inbox/Daily.md", "# Older");
    const newer = registerPendingNoteSave("Inbox/Daily.md", "# Newer");

    clearPendingNoteSave("Inbox/Daily.md", older);

    expect(matchesPendingNoteSave("Inbox/Daily.md", "# Newer")).toBe(true);

    clearPendingNoteSave("Inbox/Daily.md", newer);

    expect(hasPendingNoteSave("Inbox/Daily.md")).toBe(false);
  });
});
