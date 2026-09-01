import { describe, expect, it } from "vitest";
import {
  buildVaultWriteConflictDiff,
  getVaultWriteConflictStaleReason,
} from "@/features/notes/vault/vault-write-conflict";

describe("vault-write-conflict", () => {
  const conflict = {
    expectedRawSource: "old",
    localRawSource: "local",
    path: "notes/daily.md",
    remoteRawSource: "remote-v1",
  };

  it("revalidates delayed conflict decisions against current state", () => {
    expect(
      getVaultWriteConflictStaleReason(conflict, {
        currentDiskContent: "remote-v1",
        dirty: true,
        documentPath: "notes/daily.md",
      }),
    ).toBeNull();
    expect(
      getVaultWriteConflictStaleReason(conflict, {
        currentDiskContent: "remote-v1",
        dirty: false,
        documentPath: "notes/daily.md",
      }),
    ).toBe("not-dirty");
    expect(
      getVaultWriteConflictStaleReason(conflict, {
        currentDiskContent: "remote-v1",
        dirty: true,
        documentPath: "notes/renamed.md",
      }),
    ).toBe("document-moved");
    expect(
      getVaultWriteConflictStaleReason(conflict, {
        currentDiskContent: "remote-v2",
        dirty: true,
        documentPath: "notes/daily.md",
      }),
    ).toBe("disk-changed");
  });

  it("builds a readable diff for the remote and local versions", () => {
    const diff = buildVaultWriteConflictDiff({
      expectedRawSource: "# Before\n\nStay steady\n",
      localRawSource: "# Before\n\nKeep going\n",
      path: "notes/daily.md",
      remoteRawSource: "# Before\n\nStay calm\n",
    });

    expect(diff).toContain("--- remote/notes/daily.md");
    expect(diff).toContain("+++ local/notes/daily.md");
    expect(diff).toContain("- Stay calm");
    expect(diff).toContain("+ Keep going");
  });
});
