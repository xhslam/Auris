"use strict";

// Real production renderer + Electron media protocol + temporary writable Vault.
// Synthetic PNG clipboard events avoid reading/writing the user's OS clipboard.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const appIndex = process.argv.indexOf("--app");
const appPath = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : null;
const out = path.join(root, appPath ? "release/notes-image-paste-layout-installed-smoke" : "release/notes-image-paste-layout-smoke");

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-png-layout-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const fixture = path.join(vault, "PNG layout.md");
  fs.writeFileSync(fixture, "# PNG layout\n\nBefore image.\n");
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({
    vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {},
    mcp: { enabled: false, startOnLaunch: false },
  }));
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34886" };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  if (appPath) delete env.SHADOWING_DESKTOP_URL;
  const server = appPath ? null : spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34886", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  const evidence = { checks: [], rendererErrors: [], isolatedProfile: true };
  let app, page;
  try {
    if (server) await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error("Next exited");
      try { return (await fetch(env.SHADOWING_DESKTOP_URL)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    app = await _electron.launch(appPath
      ? { executablePath: path.join(appPath, "Contents/MacOS/Auris"), args: [fixture], env, timeout: 60000 }
      : { args: [path.join(root, "electron/main.cjs"), "--dev", fixture], env, timeout: 60000 });
    evidence.app = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, path: app.getAppPath(), version: app.getVersion() }));
    if (appPath) assert.equal(evidence.app.packaged, true);
    await expect.poll(() => app.windows().some(window => /\/notes(?:[/?#]|$)/.test(window.url())), { timeout: 60000 }).toBe(true);
    page = app.windows().find(window => /\/notes(?:[/?#]|$)/.test(window.url()));
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    const native = await app.browserWindow(page);
    await native.evaluate(window => window.setSize(1440, 900));
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await editor.evaluate(async element => {
        const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        element.focus({ preventScroll: true });
        const canvas = document.createElement("canvas"); canvas.width = 2200; canvas.height = 1600;
        const context = canvas.getContext("2d"); context.fillStyle = "#dce8d8"; context.fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const clipboardData = new DataTransfer(); clipboardData.items.add(new File([blob], "pasted.png", { type: "image/png" }));
        element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
      });
      const images = editor.locator('img[alt="pasted"]');
      await expect(images).toHaveCount(i + 1);
      await expect.poll(() => images.last().evaluate(image => image.naturalWidth)).toBe(2200);
      await page.keyboard.press("ArrowRight");
    }
    evidence.checks.push("Three 2200×1600 PNG clipboard events persist real Vault assets and load through Electron media protocol");
    await page.keyboard.press("Meta+s");
    await expect.poll(() => (fs.readFileSync(fixture, "utf8").match(/!\[pasted\]/g) || []).length).toBe(3);
    assert.equal(fs.readdirSync(path.join(vault, "assets")).filter(name => name.endsWith(".png")).length, 3);
    evidence.checks.push("Saved Markdown references all three PNG files");
    for (const size of [[1440, 900], [1160, 700]]) {
      await native.evaluate((window, dimensions) => window.setSize(...dimensions), size);
      const layout = await page.evaluate(() => [".notes-v2-page", ".notes-v2__minimal-canvas", ".desktop-app-frame__viewport"].map(selector => {
        const element = document.querySelector(selector);
        return { selector, height: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
      }));
      for (const element of layout) {
        assert.equal(element.scrollHeight, element.height, JSON.stringify(element));
        assert.equal(element.scrollTop, 0, JSON.stringify(element));
      }
      const bar = await page.locator(".notes-v2__corner-cluster--right").boundingBox();
      assert.equal(bar.y + bar.height, await page.evaluate(() => innerHeight));
      await expect(page.getByRole("region", { name: "笔记助手" })).toBeHidden();
      evidence.checks.push({ size, layout });
    }
    await page.screenshot({ path: path.join(out, "png-paste-fixed.png") });
    // The source editor uses the same available-height chain.
    await page.getByRole("button", { name: "More note actions", exact: true }).click();
    await page.getByRole("button", { name: "完整源码编辑", exact: true }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
    assert((await page.locator(".cm-content").innerText()).includes("![pasted]"));
    evidence.checks.push("Full-source mode opens with saved image references");
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (page) await page.screenshot({ path: path.join(out, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close();
    server?.kill(); fs.closeSync(log);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
