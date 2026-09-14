import { describe, expect, it } from "vitest";
import { isHiddenVaultPath } from "@/features/notes/vault/vault-path";

describe("vault-visibility", () => {
  it("hides the claude config root and its descendants", () => {
    expect(isHiddenVaultPath(".claude")).toBe(true);
    expect(isHiddenVaultPath(".claude/skills/product-complete.md")).toBe(true);
  });

  it("hides any dot-prefixed config/tooling root, not just .claude", () => {
    // .agents (AI skill definitions) was flooding the file tree and search with
    // SKILL.md files; every dot-folder is config, never the user's notes.
    expect(isHiddenVaultPath(".agents")).toBe(true);
    expect(isHiddenVaultPath(".agents/skills/dbs-action/SKILL.md")).toBe(true);
    expect(isHiddenVaultPath(".obsidian/workspace.json")).toBe(true);
  });

  it("hides the video workspace root and its descendants", () => {
    expect(isHiddenVaultPath("视频区")).toBe(true);
    expect(isHiddenVaultPath("视频区/analysis/report.md")).toBe(true);
  });

  it("keeps inbox and ordinary content visible", () => {
    expect(isHiddenVaultPath("Inbox")).toBe(false);
    expect(isHiddenVaultPath("Inbox/draft.md")).toBe(false);
    expect(isHiddenVaultPath("notes/daily.md")).toBe(false);
  });
});
