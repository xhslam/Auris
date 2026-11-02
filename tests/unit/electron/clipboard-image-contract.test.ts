import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("clipboard image contract", () => {
  it("exposes a trusted preload channel backed by Electron clipboard.readImage", () => {
    const preload = fs.readFileSync(
      path.resolve(process.cwd(), "electron/preload.cjs"),
      "utf8",
    );
    const main = fs.readFileSync(
      path.resolve(process.cwd(), "electron/main.cjs"),
      "utf8",
    );

    expect(preload).toContain("shadowing:clipboard:read-image");
    expect(main).toMatch(
      /ipcMain\.handle\(\s*"shadowing:clipboard:read-image"/u,
    );
    expect(main).toContain("clipboard.readImage()");
    expect(main).toContain("requireTrustedDesktopEvent(event)");
    expect(main).toContain("auris-terminal-images");
  });
});
