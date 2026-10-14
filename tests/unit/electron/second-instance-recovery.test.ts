import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const { recoverSecondInstance } = createRequire(import.meta.url)("../../../electron/second-instance-recovery.cjs");

describe("second instance recovery", () => {
  it.each(["win32", "linux", "darwin"])("reports window creation failure on %s with platform lifecycle policy", async (platform) => {
    const error = new Error("creation failed");
    const onError = vi.fn();
    const quit = vi.fn();
    await recoverSecondInstance({ ensureWindow: async () => { throw error; }, hasWindows: () => false, platform, onError, quit });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(quit).toHaveBeenCalledTimes(platform === "darwin" ? 0 : 1);
  });
  it("keeps a holder with another window alive", async () => {
    const quit = vi.fn();
    await recoverSecondInstance({ ensureWindow: async () => { throw new Error("creation failed"); }, hasWindows: () => true, platform: "win32", onError: vi.fn(), quit });
    expect(quit).not.toHaveBeenCalled();
  });
  it("leaves successful recovery alone", async () => {
    const onError = vi.fn();
    const quit = vi.fn();
    await recoverSecondInstance({ ensureWindow: async () => {}, hasWindows: () => true, platform: "win32", onError, quit });
    expect(onError).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });
});
