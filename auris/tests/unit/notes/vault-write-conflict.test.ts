import { describe, expect, it } from "vitest";
import { buildVaultWriteConflictDiff } from "@/features/notes/vault/vault-write-conflict";

describe("vault-write-conflict", () => {
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
