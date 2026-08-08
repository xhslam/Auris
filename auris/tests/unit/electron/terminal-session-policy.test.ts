import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createTerminalSessionInput,
  resolveTerminalCwd,
} = require("../../../electron/terminal-session-policy.cjs");

describe("terminal-session-policy", () => {
  it("keeps terminal sessions inside the configured vault directory", () => {
    expect(
      resolveTerminalCwd({
        homePath: "C:\\Users\\test",
        requestedCwd: "C:\\vault\\notes",
        vaultPath: "C:\\vault",
      }),
    ).toBe("C:\\vault\\notes");

    expect(
      resolveTerminalCwd({
        homePath: "C:\\Users\\test",
        requestedCwd: "C:\\outside",
        vaultPath: "C:\\vault",
      }),
    ).toBe("C:\\vault");
  });

  it("falls back to the home directory when no vault is configured", () => {
    expect(
      resolveTerminalCwd({
        homePath: "C:\\Users\\test",
        requestedCwd: "C:\\outside",
        vaultPath: null,
      }),
    ).toBe("C:\\Users\\test");
  });

  it("drops renderer-provided shell values from the main-process spawn input", () => {
    const input = createTerminalSessionInput(
      {
        cols: 0,
        cwd: "C:\\outside",
        rows: -1,
        sessionId: "notes-term-1",
        shell: "C:\\Windows\\System32\\cmd.exe",
      },
      {
        homePath: "C:\\Users\\test",
        vaultPath: "C:\\vault",
      },
    );

    expect(input).toEqual({
      cols: 80,
      cwd: "C:\\vault",
      rows: 24,
      sessionId: "notes-term-1",
    });
    expect(input).not.toHaveProperty("shell");
  });
});
