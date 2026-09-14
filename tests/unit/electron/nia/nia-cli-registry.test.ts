import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  ADAPTERS,
  DOCUMENTED_EXECUTABLE_NAMES,
  NiaCliRegistryError,
  assertNoUserExecutablePath,
  createNiaCliRegistry,
  getCliAdapter,
  listCliAdapters,
} = require("../../../../electron/nia/nia-cli-registry.cjs");

describe("nia-cli-registry", () => {
  it("exposes only fixed audited Claude/Codex/Gemini adapters", () => {
    expect(listCliAdapters().map((adapter: { id: string }) => adapter.id)).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
    expect(Object.isFrozen(ADAPTERS)).toBe(true);
    expect(getCliAdapter("claude").generateArgv).not.toContainEqual(expect.stringMatching(/prompt/i));
    expect(getCliAdapter("claude").toolModeDisable).toBe(true);
    expect(getCliAdapter("codex").toolModeDisable).toBe(false);
    expect(getCliAdapter("codex").generationOnly).toBe(false);
    expect(getCliAdapter("gemini").generationOnly).toBe(true);
  });

  it("rejects user-supplied executable paths and unknown adapters", () => {
    expect(() => assertNoUserExecutablePath("/usr/local/bin/claude")).toThrow(NiaCliRegistryError);
    expect(() => assertNoUserExecutablePath("../claude")).toThrow(NiaCliRegistryError);
    expect(() => assertNoUserExecutablePath("~/claude")).toThrow(NiaCliRegistryError);
    expect(() => assertNoUserExecutablePath("claude")).not.toThrow();
    expect(() => getCliAdapter("cursor")).toThrow(/Unknown CLI adapter/);
    expect(DOCUMENTED_EXECUTABLE_NAMES.claude).toEqual(["claude"]);
  });

  it("detects adapters only via documented names and reports agentic state", () => {
    const registry = createNiaCliRegistry({
      whichImpl: (name: string) => (name === "claude" ? "/opt/homebrew/bin/claude" : null),
      spawnSyncImpl: () => ({ status: 0, stdout: "claude 1.2.3\n", stderr: "" }),
    });

    const claude = registry.detectAdapter("claude");
    expect(claude).toMatchObject({
      adapterId: "claude",
      available: true,
      command: "claude",
      path: "/opt/homebrew/bin/claude",
      version: "claude 1.2.3",
      generationOnly: true,
      toolModeDisable: true,
      agentic: false,
    });

    const codex = createNiaCliRegistry({
      whichImpl: (name: string) => (name === "codex" ? "/usr/local/bin/codex" : null),
      spawnSyncImpl: () => ({ status: 0, stdout: "codex 0.1\n", stderr: "" }),
    }).detectAdapter("codex");
    expect(codex).toMatchObject({
      available: true,
      agentic: true,
      toolModeDisable: false,
      generationOnly: false,
    });

    const missing = createNiaCliRegistry({
      whichImpl: () => null,
      spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "" }),
    }).detectAdapter("gemini");
    expect(missing.available).toBe(false);
    expect(missing.path).toBeNull();
  });
});
