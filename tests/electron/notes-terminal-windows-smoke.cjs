"use strict";

// Windows source-Electron smoke. It owns its temporary Vault, userData and
// optional Next server. No installed App/profile, personal note or OS clipboard
// is changed. Build first, then node this file --out <evidence-directory>.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { stripVTControlCharacters } = require("node:util");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const option = (name) => process.argv.includes(name) ? arg(name) : null;
const active = ".notes-v2__terminal-xterm[data-active='true']";
const probe = `"use strict";
const mode = process.argv[2];
const say = (message) => process.stdout.write(message + "\\r\\n");
if (mode === "interrupt") {
  const timer = setInterval(() => {}, 1000);
  process.on("SIGINT", () => { say("AURIS_SIGINT_OK"); clearInterval(timer); process.exitCode = 0; });
  say("AURIS_SIGINT_WAIT");
} else if (mode === "tty") {
  process.stdin.setRawMode(true);
  process.stdin.once("data", () => { process.stdin.setRawMode(false); process.stdin.pause(); say("AURIS_TITLE_EXIT"); process.exitCode = 0; });
  process.stdin.resume();
  say("AURIS_TTY " + JSON.stringify({ stdin: !!process.stdin.isTTY, stdout: !!process.stdout.isTTY }));
  process.stdout.write("\\x1b]0;Auris Terminal Test\\x07\\x1b[32mAURIS_ANSI_OK\\x1b[0m\\r\\n");
  say("AURIS_CJK_OK 中文终端");
} else {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const exit = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.exitCode = 0; };
  if (mode === "alternate") {
    process.stdout.write("\\x1b[?1049h\\x1b[2J\\x1b[HAURIS_ALT_BAD\\r\\x1b[2KAURIS_ALT_OK\\r\\n");
    process.stdin.once("data", () => { process.stdout.write("\\x1b[?1049l"); say("AURIS_ALT_EXIT"); exit(); });
  } else if (mode === "paste") {
    let input = "";
    process.stdout.write("\\x1b[?2004h"); say("AURIS_PASTE_READY");
    process.stdin.on("data", (data) => {
      input += data.toString("utf8");
      if (input.includes("\\x1b[201~")) {
        process.stdout.write("\\x1b[?2004l");
        say("AURIS_PASTE_BASE64 " + Buffer.from(input, "utf8").toString("base64")); exit();
      }
    });
  } else if (mode === "geometry") {
    const report = () => { const [cols, rows] = process.stdout.getWindowSize(); say("AURIS_SIZE " + cols + "x" + rows); };
    report(); process.stdout.on("resize", report);
    process.stdin.on("data", (data) => { if (data.toString() === "x") exit(); else report(); });
  }
}
`;

async function rows(page) { return page.locator(`${active} .xterm-rows`).textContent(); }
async function text(page, expected) {
  await page.waitForFunction(({ selector, expected }) => Array.from(document.querySelectorAll(`${selector} .xterm-rows > div`)).some(row => row.textContent.trim().startsWith(expected)), { selector: active, expected });
}
async function command(page, value) {
  // A child's last output marker is not proof that CMD has reclaimed stdin.
  // Wait for its actual next prompt, otherwise a fast automated command can
  // be delivered to the exiting probe and discarded by console cleanup.
  await expect.poll(async () => {
    const output = await page.evaluate(async () => {
      const screens = Array.from(document.querySelectorAll(".notes-v2__terminal-xterm"));
      const index = screens.findIndex(screen => screen.getAttribute("data-active") === "true");
      const live = (await window.shadowingDesktop.terminal.list()).filter(session => session.backend);
      // Attached screen order matches creation order in this controlled smoke;
      // dormant descriptor tabs are deliberately not counted as live screens.
      return live[index]?.output ?? "";
    });
    // Backend readiness is independent of a search-scrolled viewport. Actual
    // keyboard input must then scroll xterm to its live cursor normally.
    // Node's VT-strip regex treats a Windows drive in OSC titles as an early
    // terminator. Remove the BEL-terminated CMD/probe titles before stripping
    // CSI, so the raw recovery stream's final title is not mistaken for text.
    const withoutTitles = output.replace(/\x1b\][^\x07]*\x07/g, "");
    return stripVTControlCharacters(withoutTitles).trimEnd().endsWith(">");
  }, { timeout: 20_000 }).toBe(true);
  await page.locator(`${active} .xterm-helper-textarea`).focus();
  // insertText preserves Unicode and literal CMD quotes. These are ordinary
  // terminal input events, not direct backend writes that bypass xterm.
  await page.keyboard.insertText(value);
  await page.keyboard.press("Enter");
}
async function toggle(page) {
  await page.getByRole("button", { name: "打开终端面板", exact: true }).click();
}
async function notesWindow(app) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const page = app.windows().find(page => /\/notes(?:[/?#]|$)/.test(page.url()));
    if (page) return page;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("No Notes window: " + app.windows().map(page => page.url()).join(", "));
}
async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Next server was not ready");
}
async function main() {
  assert.equal(process.platform, "win32", "This smoke requires Windows/ConPTY");
  const out = path.resolve(option("--out") || fs.mkdtempSync(path.join(os.tmpdir(), "auris-terminal-windows-")));
  fs.mkdirSync(out, { recursive: true });
  const profileRoot = fs.mkdtempSync(path.join(out, "isolated-"));
  const vault = path.join(profileRoot, "vault");
  const userData = path.join(profileRoot, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const fixture = path.join(vault, "Windows终端验收.md");
  const source = "# Windows 终端验收\n\n这是隔离的临时笔记，不能写入真实 Vault。\n";
  fs.writeFileSync(fixture, source, "utf8");
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { autoApproveEdits: false, enabled: false, startOnLaunch: false } }), "utf8");
  fs.writeFileSync(path.join(userData, "terminal-session-recovery.json"), JSON.stringify({ sessions: [{ id: "smoke-dormant", cwd: vault, shell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", cols: 80, rows: 24, workspaceInstanceId: "smoke-other-workspace" }] }), "utf8");
  const probePath = path.join(vault, "terminal-probe.cjs");
  fs.writeFileSync(probePath, probe, "utf8");
  const invoke = mode => `"${process.execPath}" "${probePath}" ${mode}`;
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  let server, serverLog, app, page;
  const evidence = { startedAt: new Date().toISOString(), sourceRoot: root, isolatedUserData: true, out, profileRoot, rendererMessages: [], checks: [] };
  const save = () => fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2), "utf8");
  const checked = name => evidence.checks.push(name);
  try {
    let url = option("--dev-url");
    if (!url) {
      const port = Number(option("--port") || 34877);
      url = `http://127.0.0.1:${port}`;
      serverLog = fs.openSync(path.join(out, "next-server.log"), "w");
      server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "--hostname", "127.0.0.1"], { cwd: root, env, windowsHide: true, stdio: ["ignore", serverLog, serverLog] });
      await waitForServer(url, server);
    }
    env.SHADOWING_DESKTOP_URL = url;
    app = await _electron.launch({ args: [path.join(root, "electron/main.cjs"), "--dev", fixture], env, timeout: 60_000 });
    app.on("window", window => window.on("pageerror", error => evidence.rendererMessages.push(error.message)));
    page = await notesWindow(app);
    page.on("pageerror", error => evidence.rendererMessages.push(error.message));
    page.setDefaultTimeout(20_000);
    await page.locator(".ProseMirror p").first().waitFor({ state: "visible", timeout: 60_000 });
    // Multiple Notes windows may share the route. Resize this page's native
    // window, not whichever /notes window happens to occur first in a list.
    const nativeWindow = await app.browserWindow(page);
    evidence.windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ id: window.id, url: window.webContents.getURL() })));
    evidence.pageWindowId = await nativeWindow.evaluate(window => window.id);
    evidence.initialBounds = await nativeWindow.evaluate(window => {
      if (window.isMaximized()) window.unmaximize();
      window.setSize(1440, 900); return window.getBounds();
    });
    const list = () => page.evaluate(() => window.shadowingDesktop.terminal.list());
    const before = await list();
    assert.equal(before.length, 1); assert.equal(before[0].backend, null);
    checked("list does not spawn dormant recovery shell");
    await page.evaluate(() => {
      window.__terminalSmoke = { openedAt: performance.now(), firstDataAt: null };
      window.__terminalSmoke.remove = window.shadowingDesktop.terminal.onData(() => { window.__terminalSmoke.firstDataAt ??= performance.now(); });
    });
    const openedAt = Date.now();
    await toggle(page);
    await page.locator(`${active} .xterm-helper-textarea`).waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(selector => document.querySelector(`${selector} .xterm-rows`)?.textContent.includes(">"), active, { timeout: 30_000 });
    evidence.clickToRenderedPromptMs = Date.now() - openedAt;
    evidence.firstDataMs = await page.evaluate(() => window.__terminalSmoke.firstDataAt - window.__terminalSmoke.openedAt);
    const initial = (await list()).filter(session => session.backend);
    assert.equal(initial.length, 1); assert.equal(initial[0].backend, "pty");
    assert.match(initial[0].shell, /cmd\.exe$/i); assert.equal(initial[0].ptyPackage, "node-pty");
    const firstId = initial[0].id;
    checked("Windows default cmd with real node-pty ConPTY");
    await command(page, invoke("tty"));
    await text(page, "AURIS_CJK_OK 中文终端");
    assert((await rows(page)).includes('AURIS_TTY {"stdin":true,"stdout":true}'));
    evidence.ansiRendered = await page.locator(`${active} .xterm-rows > div`).evaluateAll(rows => rows.some(row => row.textContent.trim() === "AURIS_ANSI_OK" && [...row.querySelectorAll("span")].some(span => getComputedStyle(span).color !== getComputedStyle(row).color)));
    assert(evidence.ansiRendered);
    checked("TTY, native input, Unicode and ANSI color rendering");
    await page.getByRole("tab", { name: "Auris Terminal Test", exact: true }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Auris Terminal Test", exact: true }).textContent(), "A");
    checked("OSC program title and grapheme tab label");
    await page.locator(`${active} .xterm-helper-textarea`).focus(); await page.keyboard.press("x");
    await text(page, "AURIS_TITLE_EXIT");
    await command(page, invoke("alternate"));
    await text(page, "AURIS_ALT_OK");
    assert(!(await rows(page)).includes("AURIS_ALT_BAD"));
    assert(!(await rows(page)).includes("AURIS_TTY"));
    await page.locator(`${active} .xterm`).evaluate(element => { window.__terminalSmoke.screen = element; });
    await toggle(page);
    await page.waitForFunction(() => document.querySelector(".notes-v2").dataset.terminalOpen === "false");
    await toggle(page);
    await text(page, "AURIS_ALT_OK");
    assert(await page.evaluate(selector => window.__terminalSmoke.screen === document.querySelector(`${selector} .xterm`), active));
    assert.equal((await list()).find(session => session.backend).id, firstId);
    await page.locator(`${active} .xterm-helper-textarea`).focus();
    await page.keyboard.press("x");
    await text(page, "AURIS_ALT_EXIT");
    assert((await rows(page)).includes("AURIS_TTY"));
    checked("alternate screen, cursor/erase and same screen/PTY after hide/reopen");
    await command(page, invoke("paste"));
    await text(page, "AURIS_PASTE_READY");
    const pasteText = "中文 paste\nsecond line";
    // The desktop read provider is first in Auris's clipboard chain. Replace
    // only this isolated App's IPC read handler with a fixture, without reading
    // or overwriting the system clipboard. This mock dies with the test App.
    await app.evaluate(({ ipcMain }, value) => {
      ipcMain.removeHandler("shadowing:clipboard:read-text");
      ipcMain.handle("shadowing:clipboard:read-text", () => value);
    }, pasteText);
    await page.keyboard.press("Control+v");
    await text(page, "AURIS_PASTE_BASE64 ");
    const result = (await rows(page)).match(/AURIS_PASTE_BASE64 ([A-Za-z0-9+/=]+)/);
    assert(result);
    assert.equal(Buffer.from(result[1], "base64").toString("utf8"), `\x1b[200~${pasteText.replace(/\n/g, "\r")}\x1b[201~`);
    checked("Ctrl+V uses xterm bracketed paste with multiline Chinese");
    await command(page, invoke("geometry"));
    await text(page, "AURIS_SIZE ");
    const oldSize = (await list()).find(session => session.id === firstId);
    evidence.beforeResize = { cols: oldSize.cols, rows: oldSize.rows };
    evidence.beforeViewport = await page.evaluate(selector => ({ width: innerWidth, height: innerHeight, hostWidth: document.querySelector(selector).clientWidth, hostHeight: document.querySelector(selector).clientHeight }), active);
    evidence.resizedBounds = await nativeWindow.evaluate(window => {
      if (window.isMaximized()) window.unmaximize();
      window.setSize(1120, 720); return window.getBounds();
    });
    // Playwright's waitForFunction treats a Promise as truthy rather than
    // repeatedly awaiting an async predicate. Poll IPC from the test runner.
    await expect.poll(async () => (await list()).some(session => session.id === firstId && (session.cols !== oldSize.cols || session.rows !== oldSize.rows)), { timeout: 20_000 }).toBe(true);
    await page.locator(`${active} .xterm-helper-textarea`).focus();
    await expect.poll(async () => {
      await page.keyboard.press("r");
      const session = (await list()).find(session => session.id === firstId);
      const output = await rows(page);
      return Boolean(session && (session.cols !== oldSize.cols || session.rows !== oldSize.rows) && output.includes(`AURIS_SIZE ${session.cols}x${session.rows}`));
    }, { timeout: 20_000 }).toBe(true);
    const resized = (await list()).find(session => session.id === firstId);
    evidence.afterResize = { cols: resized.cols, rows: resized.rows };
    evidence.afterViewport = await page.evaluate(selector => ({ width: innerWidth, height: innerHeight, hostWidth: document.querySelector(selector).clientWidth, hostHeight: document.querySelector(selector).clientHeight }), active);
    evidence.afterBounds = await nativeWindow.evaluate(window => window.getBounds());
    assert(oldSize.cols !== resized.cols || oldSize.rows !== resized.rows, "Native TTY geometry must actually change");
    await text(page, `AURIS_SIZE ${resized.cols}x${resized.rows}`);
    evidence.resize = { from: { cols: oldSize.cols, rows: oldSize.rows }, to: { cols: resized.cols, rows: resized.rows } };
    await page.locator(`${active} .xterm-helper-textarea`).focus(); await page.keyboard.press("x");
    checked("window resize reaches native child TTY dimensions");
    await command(page, invoke("interrupt")); await text(page, "AURIS_SIGINT_WAIT");
    await page.keyboard.press("Control+c"); await text(page, "AURIS_SIGINT_OK");
    checked("Ctrl+C without a selection interrupts the native foreground process");
    await page.keyboard.press("Control+f");
    await page.locator(".notes-v2__terminal-search input").waitFor({ state: "visible" });
    await page.locator(".notes-v2__terminal-search input").fill("AURIS_CJK_OK");
    await page.keyboard.press("Escape");
    assert(await page.locator(`${active} .xterm-helper-textarea`).evaluate(element => document.activeElement === element));
    await page.keyboard.press("Control+=");
    await page.waitForFunction(() => localStorage.getItem("auris.notes.terminal.font-size") === "15");
    await page.keyboard.press("Control+0");
    await page.waitForFunction(() => localStorage.getItem("auris.notes.terminal.font-size") === "13");
    checked("compact search/Escape focus and terminal-local zoom/reset");
    await command(page, "echo AURIS_FIRST_BUFFER_OK"); await text(page, "AURIS_FIRST_BUFFER_OK");
    await page.getByRole("button", { name: "新会话", exact: true }).click();
    await expect.poll(async () => (await list()).filter(session => session.backend).length, { timeout: 20_000 }).toBe(2);
    await page.waitForFunction(() => document.querySelector('.notes-v2__terminal-tab[aria-selected="true"]')?.dataset.status === "running");
    await command(page, "echo AURIS_SECOND_SESSION_OK"); await text(page, "AURIS_SECOND_SESSION_OK");
    await page.locator(".notes-v2__terminal-tab").nth(0).click(); await text(page, "AURIS_FIRST_BUFFER_OK");
    assert(!(await rows(page)).includes("AURIS_SECOND_SESSION_OK"));
    await toggle(page); await toggle(page);
    assert(await page.locator(`${active} .xterm-helper-textarea`).evaluate(element => document.activeElement === element));
    await command(page, "echo AURIS_ACTIVE_FOCUS_OK"); await text(page, "AURIS_ACTIVE_FOCUS_OK");
    checked("two session buffers and reopen focuses the selected textarea");
    await nativeWindow.evaluate(window => window.setSize(1440, 900));
    const readingThemes = {
      white: ["rgb(255, 255, 255)", "rgb(26, 26, 26)"],
      paper: ["rgb(238, 237, 237)", "rgb(26, 26, 26)"],
      mint: ["rgb(204, 230, 208)", "rgb(45, 58, 53)"],
      sepia: ["rgb(249, 240, 219)", "rgb(92, 75, 55)"],
      solarized: ["rgb(0, 43, 54)", "rgb(147, 161, 161)"],
      night: ["rgb(35, 38, 43)", "rgb(214, 217, 222)"],
    };
    evidence.readingThemes = [];
    for (const [theme, expectedColors] of Object.entries(readingThemes)) {
      await page.evaluate(theme => {
        localStorage.setItem("auris.notes.reading-theme", theme);
        window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: theme }));
      }, theme);
      await page.waitForFunction(theme => document.querySelector(".notes-v2")?.dataset.notesTheme === theme, theme);
      const colors = () => page.evaluate(selector => [
        getComputedStyle(document.querySelector(`${selector} .xterm`)).backgroundColor,
        getComputedStyle(document.querySelector(`${selector} .xterm-rows`)).color,
      ], active);
      await expect.poll(colors, { timeout: 20_000 }).toEqual(expectedColors);
      evidence.readingThemes.push({ theme, colors: await colors() });
    }
    checked("all six VMark reading backgrounds and foregrounds update without replacing the screen");
    await page.screenshot({ path: path.join(out, "notes-terminal-windows.png"), fullPage: true });
    await page.locator(".notes-v2__terminal-session-actions").getByRole("button", { name: "关闭", exact: true }).click();
    await page.locator(".notes-v2__terminal-session-actions").getByRole("button", { name: "关闭", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".notes-v2").dataset.terminalOpen === "false");
    await expect.poll(async () => (await list()).filter(session => session.backend).length, { timeout: 20_000 }).toBe(0);
    checked("closing last live tab hides pane and does not immediately spawn another shell");
    await toggle(page);
    await expect.poll(async () => (await list()).filter(session => session.backend).length, { timeout: 20_000 }).toBe(1);
    await command(page, "echo AURIS_REOPEN_AFTER_CLOSE_OK"); await text(page, "AURIS_REOPEN_AFTER_CLOSE_OK");
    checked("reopening after close-last creates one new usable shell");
    assert.equal((await list()).find(session => session.id === "smoke-dormant").backend, null);
    assert.equal(fs.readFileSync(fixture, "utf8"), source);
    checked("dormant other-workspace tab and fixture preserved");
    evidence.sessions = await list();
    evidence.success = true;
  } catch (error) {
    evidence.success = false; evidence.error = error.stack || String(error);
    if (page) {
      try {
        evidence.failureText = await page.locator("body").innerText();
        evidence.failureSessions = await page.evaluate(() => window.shadowingDesktop.terminal.list());
        await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
      } catch {}
    }
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString(); save();
    if (app) await app.close().catch(() => {});
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => { server.once("exit", resolve); setTimeout(resolve, 5_000); }); }
    if (serverLog !== undefined) fs.closeSync(serverLog);
  }
  console.log(JSON.stringify({ success: evidence.success, checks: evidence.checks, clickToRenderedPromptMs: evidence.clickToRenderedPromptMs, firstDataMs: evidence.firstDataMs, evidence: path.join(out, "evidence.json") }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
