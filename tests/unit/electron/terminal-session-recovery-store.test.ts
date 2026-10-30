import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createTerminalSessionRecoveryStore } = require("../../../electron/terminal-session-recovery-store.cjs");

const directories: string[] = [];
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

describe("terminal session recovery store", () => {
  it("preserves trailing spaces in project cwd when saving and restoring", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "auris-terminal-recovery-")); directories.push(directory);
    const store = createTerminalSessionRecoveryStore(path.join(directory, "sessions.json"));
    store.save([{ cwd: "/projects/customer ", id: "focus-term-spaces", shell: "/bin/zsh" }]);
    expect(store.load()[0].cwd).toBe("/projects/customer ");
  });

  it("persists only recoverable, bounded terminal descriptors", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "auris-terminal-recovery-"));
    directories.push(directory);
    const store = createTerminalSessionRecoveryStore(path.join(directory, "sessions.json"));

    const saved = store.save([
      { cols: 120, cwd: "/workspace", id: "notes-term-1", rows: 40, shell: "/bin/zsh", workspaceInstanceId: "path:darwin:/workspace" },
      { cwd: "relative", id: "bad", shell: "/bin/zsh" },
    ]);

    expect(saved).toEqual([{ cols: 120, cwd: "/workspace", id: "notes-term-1", rows: 40, shell: "/bin/zsh", workspaceInstanceId: "path:darwin:/workspace" }]);
    expect(store.load()).toEqual(saved);
  });

  it("treats malformed or unavailable recovery files as an empty recovery set", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "auris-terminal-recovery-"));
    directories.push(directory);
    const store = createTerminalSessionRecoveryStore(path.join(directory, "missing.json"));
    expect(store.load()).toEqual([]);
  });
});
