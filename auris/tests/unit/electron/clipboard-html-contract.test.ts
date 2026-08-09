import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("rich HTML clipboard contract", () => {
  it("exposes a trusted preload channel backed by Electron clipboard.write", () => {
    const preload = fs.readFileSync(
      path.resolve(process.cwd(), "electron/preload.cjs"),
      "utf8",
    );
    const main = fs.readFileSync(
      path.resolve(process.cwd(), "electron/main.cjs"),
      "utf8",
    );

    expect(preload).toContain("shadowing:clipboard:write-html");
    expect(main).toMatch(
      /ipcMain\.handle\(\s*"shadowing:clipboard:write-html"/u,
    );
    expect(main).toContain("clipboard.write({");
    expect(main).toContain("requireTrustedMainFrameEvent(event)");
    expect(main).toContain("MAX_RICH_CLIPBOARD_HTML_BYTES");
  });
});
