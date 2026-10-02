import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureNotesRecoveryDraft,
  clearNotesRecoveryDraft,
  listNotesHistoryVersions,
  listNotesRecoveryDrafts,
  recordNotesHistoryVersion,
  resetNotesRecoveryMigrationForTests,
} from "@/features/notes/persistence/notes-recovery-store";

describe("notes recovery and history persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.shadowingDesktop = undefined;
    resetNotesRecoveryMigrationForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T10:00:00.000Z"));
  });

  it("keeps one hot-exit draft per vault and path", async () => {
    await captureNotesRecoveryDraft({
      path: "a.md",
      rawSource: "one",
      vaultRoot: "/vault",
    });
    await captureNotesRecoveryDraft({
      path: "a.md",
      rawSource: "two",
      vaultRoot: "/vault",
    });

    await expect(listNotesRecoveryDrafts("/vault")).resolves.toMatchObject([
      { path: "a.md", rawSource: "two" },
    ]);
    await clearNotesRecoveryDraft("a.md", "/vault");
    await expect(listNotesRecoveryDrafts("/vault")).resolves.toEqual([]);
  });

  it("conditional cleanup retains a different newer draft", async () => {
    await captureNotesRecoveryDraft({ path: "a.md", rawSource: "newest", vaultRoot: "/vault" });
    await clearNotesRecoveryDraft("a.md", "/vault", "older");
    expect(await listNotesRecoveryDrafts("/vault")).toEqual([expect.objectContaining({ rawSource: "newest" })]);
    await clearNotesRecoveryDraft("a.md", "/vault", "newest");
    expect(await listNotesRecoveryDrafts("/vault")).toEqual([]);
  });

  it("deduplicates adjacent history versions", async () => {
    await recordNotesHistoryVersion({
      path: "a.md",
      rawSource: "saved",
      vaultRoot: "/vault",
    });
    await recordNotesHistoryVersion({
      path: "a.md",
      rawSource: "saved",
      vaultRoot: "/vault",
    });

    await expect(listNotesHistoryVersions("a.md", "/vault")).resolves.toHaveLength(1);
  });

  it("migrates localStorage before using the desktop bridge", async () => {
    window.localStorage.setItem(
      "auris.notes.hot-exit.v1",
      JSON.stringify([
        {
          capturedAt: "2026-07-01T00:00:00.000Z",
          path: "legacy.md",
          rawSource: "legacy",
          vaultRoot: "/vault",
        },
      ]),
    );
    const importLegacy = vi.fn(async () => ({
      draftsImported: 1,
      historyImported: 0,
      imported: true,
    }));
    const listDrafts = vi.fn(async () => []);
    window.shadowingDesktop = {
      notesRecovery: {
        captureDraft: vi.fn(async () => true),
        clearDraft: vi.fn(async () => undefined),
        importLegacy,
        listDrafts,
        listHistory: vi.fn(async () => []),
        recordHistory: vi.fn(async () => undefined),
      },
    } as unknown as NonNullable<typeof window.shadowingDesktop>;

    await listNotesRecoveryDrafts("/vault");

    expect(importLegacy).toHaveBeenCalledWith({
      drafts: [
        expect.objectContaining({
          path: "legacy.md",
          rawSource: "legacy",
        }),
      ],
      history: [],
    });
    expect(window.localStorage.getItem("auris.notes.hot-exit.v1")).toBeNull();
    expect(listDrafts).toHaveBeenCalledWith("/vault");
  });
});
