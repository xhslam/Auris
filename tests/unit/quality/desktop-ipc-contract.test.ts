import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertDesktopIpcContract,
  collectIpcContract,
  verifyDesktopIpcContract,
} = require("../../../scripts/verify-desktop-ipc-contract.cjs");

describe("desktop IPC contract", () => {
  it("covers every literal preload invoke with a main-process handler", () => {
    const contract = verifyDesktopIpcContract();
    expect(contract.invokes.length).toBeGreaterThan(0);
    expect(contract.missingHandlers).toEqual([]);
    expect(contract.invokes).toContain("shadowing:updates:recover");
    expect(contract.invokes).toContain("shadowing:external-markdown:open-linked");
  });

  it("reports a missing main handler deterministically", () => {
    const contract = collectIpcContract(
      'const reload = () => invoke("shadowing:updates:recover");',
      'ipcMain.handle("shadowing:updates:check", async () => {});',
    );
    expect(contract.missingHandlers).toEqual(["shadowing:updates:recover"]);
    expect(() => assertDesktopIpcContract(contract)).toThrow(
      /shadowing:updates:recover/,
    );
  });
});
