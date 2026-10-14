"use strict";

// Production renderer, isolated userData and temporary Vault.
// --app verifies an installed package; otherwise launches source Electron.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const outIndex = process.argv.indexOf("--out");
const out = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : "release/vmark-0999-smoke");
const appIndex = process.argv.indexOf("--app");
const appPath = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : null;

async function main() {
  assert.equal(process.platform, "darwin", "This shell probe requires macOS; platform policies have separate unit tests.");
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-vmark-0999-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const fixture = path.join(vault, "同步验收.md");
  const source = '# 同步验收\n\n公式 $\\frac{1}{2}$。\n\n```mermaid title="flow"\ngraph TD; A-->B\n```\n\n```ts title="safe.ts"\nconst answer = 42;\n```\n\n原文保持不变。\n';
  fs.writeFileSync(fixture, source);
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { enabled: false, startOnLaunch: false } }));
  const evidence = { upstream: "f2bf1b3fce06ca21fe7cd19382bef9c4774d0558", checks: [], rendererErrors: [], isolatedProfile: true };
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34879" };
  delete env.ELECTRON_RUN_AS_NODE;
  if (appPath) delete env.SHADOWING_DESKTOP_URL;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = appPath ? null : spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34879", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  let app;
  try {
    if (server) await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error(`Next exited ${server.exitCode}`);
      try { return (await fetch(env.SHADOWING_DESKTOP_URL)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    app = await _electron.launch(appPath
      ? { executablePath: path.join(appPath, "Contents/MacOS/Auris"), args: [fixture], env, timeout: 60000 }
      : { args: [path.join(root, "electron/main.cjs"), "--dev", fixture], env, timeout: 60000 });
    evidence.app = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, path: app.getAppPath() }));
    if (appPath) assert.equal(evidence.app.packaged, true);
    await expect.poll(() => app.windows().some(page => /\/notes(?:[/?#]|$)/.test(page.url())), { timeout: 60000 }).toBe(true);
    const page = app.windows().find(page => /\/notes(?:[/?#]|$)/.test(page.url()));
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    const native = await app.browserWindow(page);
    await native.evaluate(window => { window.setSize(1440, 900); window.show(); });
    const editor = page.locator(".ProseMirror").first();
    await editor.waitFor({ state: "visible" });
    await editor.locator(".notes-v2__pm-code-block-preview svg").waitFor({ state: "attached" });
    await editor.locator(".katex").waitFor({ state: "attached" });
    evidence.checks.push("Notes opens; Mermaid 12.1 SVG and existing math render");
    const code = editor.locator(".notes-v2__pm-code-block-content").filter({ hasText: "const answer" });
    await code.evaluate(element => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(element.firstChild, 3); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      element.closest(".ProseMirror").focus();
    });
    await page.keyboard.press("Meta+1");
    await expect(code).toHaveText("const answer = 42;");
    evidence.checks.push("real rich editor heading shortcut preserves code fence");
    await page.getByRole("button", { name: "打开终端面板", exact: true }).click();
    const host = page.locator(".notes-v2__terminal-xterm[data-active='true']");
    const input = host.locator(".xterm-helper-textarea");
    await input.waitFor({ state: "attached" });
    await expect.poll(async () => (await page.evaluate(() => window.shadowingDesktop.terminal.list())).some(record => record.backend === "pty")).toBe(true);
    const send = async command => { await input.focus(); await page.keyboard.insertText(command); await page.keyboard.press("Enter"); };
    await send("printf '%s\\n' HISTORY_{1..100}");
    await expect.poll(() => host.locator(".xterm-rows").textContent()).toContain("HISTORY_100");
    await host.locator(".xterm-screen").hover();
    await page.mouse.wheel(0, -700);
    const overlay = host.locator(".notes-terminal-floating-prompt");
    await expect(overlay).toBeVisible();
    const history = await host.locator(".xterm-rows").textContent();
    await input.focus();
    await page.keyboard.insertText("printf 'AURIS_ORDER_中文_OK\\n'");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".notes-terminal-floating-prompt-rows")).toContainText("AURIS_ORDER_中文_OK");
    assert.equal(await host.locator(".xterm-rows").textContent(), history, "typing must preserve the history viewport");
    await page.screenshot({ path: path.join(out, "floating-prompt.png") });
    evidence.checks.push("real PTY Chinese input mirrored without disturbing scrollback");
    await page.keyboard.press("Enter");
    await expect(overlay).toBeHidden();
    await expect.poll(() => host.locator(".xterm-rows").textContent()).toContain("AURIS_ORDER_中文_OK");
    evidence.checks.push("Enter returns to output");
    await host.locator(".xterm-screen").hover(); await page.mouse.wheel(0, -500);
    await expect(overlay).toBeVisible();
    await overlay.getByRole("button", { name: "回到输入位置" }).click();
    await expect(overlay).toBeHidden();
    assert.equal(await input.evaluate(element => element === document.activeElement), true, "jump must retain terminal focus");
    evidence.checks.push("jump button retains native input ownership");
    for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
      await page.evaluate(value => { localStorage.setItem("auris.notes.reading-theme", value); window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value })); }, theme);
      await host.locator(".xterm-screen").hover(); await page.mouse.wheel(0, -500);
      await expect(overlay).toBeVisible();
      const colors = await overlay.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color, width: element.clientWidth, button: getComputedStyle(element.querySelector("button")).backgroundColor }));
      assert(colors.width > 0 && colors.background !== "rgba(0, 0, 0, 0)");
      (evidence.themes ??= {})[theme] = colors;
      await overlay.getByRole("button", { name: "回到输入位置" }).click();
    }
    evidence.checks.push("floating prompt visible in six themes");
    assert.equal(fs.readFileSync(fixture, "utf8"), source, "original temporary note must remain unchanged");
    evidence.checks.push("note unchanged");
    assert.deepEqual(evidence.rendererErrors, [], "renderer must have no uncaught errors");
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack; throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close();
    if (server) server.kill(); fs.closeSync(log);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
