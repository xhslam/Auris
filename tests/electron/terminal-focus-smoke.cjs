"use strict";

// Source-Electron acceptance using isolated userData and a temporary Vault.
// Never opens a personal project, changes the installed App or uses OS clipboard.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { stripVTControlCharacters } = require("node:util");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const output = path.resolve(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(root, "release/terminal-focus-smoke"));
const scope = "auris:terminal-focus";

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-terminal-focus-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const note = path.join(vault, "terminal-smoke.md");
  const source = "# Terminal focus smoke\n\nIsolated Notes fixture.\n";
  fs.writeFileSync(note, source);
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { enabled: false, startOnLaunch: false, autoApproveEdits: false } }));
  // Isolate interactive Shell startup too: do not execute the user's .zshrc
  // or auto-launch personal agents while issuing deterministic test commands.
  const shellHome = path.join(profile, "shell-home");
  fs.mkdirSync(shellHome);
  fs.writeFileSync(path.join(shellHome, ".zshrc"), "PROMPT='auris-smoke> '\n");
  const env = { ...process.env, ZDOTDIR: shellHome, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const port = 34919;
  const url = `http://127.0.0.1:${port}`;
  const log = fs.openSync(path.join(output, "next.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  const evidence = { startedAt: new Date().toISOString(), checks: [], errors: [], profile };
  let app;
  const save = () => fs.writeFileSync(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  try {
    await expect.poll(async () => { try { return (await fetch(url)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
    env.SHADOWING_DESKTOP_URL = url;
    const packagedApp = process.argv.includes("--app") ? path.resolve(process.argv[process.argv.indexOf("--app") + 1]) : null;
    app = await _electron.launch(packagedApp ? {
      executablePath: path.join(packagedApp, "Contents/MacOS/Auris"), args: [note], env, timeout: 60000,
    } : { args: [path.join(root, "electron/main.cjs"), "--dev", note], env, timeout: 60000 });
    let page;
    await expect.poll(() => {
      page = app.windows().find((candidate) => /\/notes(?:[/?#]|$)/.test(candidate.url()));
      return Boolean(page);
    }, { timeout: 60000 }).toBe(true);
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.locator(".ProseMirror p").first().waitFor({ timeout: 60000 });
    evidence.checks.push("Notes route opens before terminal mode");
    const nativeWindow = await app.browserWindow(page);
    await nativeWindow.evaluate((window) => { window.setSize(1580, 1040); window.show(); window.focus(); });
    await page.evaluate(() => { localStorage.setItem("auris.notes.reading-theme", "night"); });
    await page.goto(`${url}/terminal`);
    await page.getByRole("heading", { name: "终端模式", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "终端模式", exact: true })).toBeVisible();
    const live = () => page.evaluate(async (scope) => (await window.shadowingDesktop.terminal.list()).filter((record) => record.workspaceInstanceId === scope && record.backend), scope);
    await expect.poll(async () => (await live()).length).toBe(1);
    for (let count = 2; count <= 8; count++) {
      await page.getByRole("button", { name: "新建终端", exact: true }).click();
      await expect.poll(async () => (await live()).length).toBe(count);
    }
    await expect(page.getByRole("button", { name: "新建终端", exact: true })).toBeDisabled();
    const initial = await live();
    assert.equal(initial.every((record) => record.backend === "pty"), true, "Must use real PTY, not pipe fallback");
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(8);
    evidence.checks.push("8 real PTYs, 8 visible panels, ninth creation disabled");
    for (let index = 0; index < 8; index++) {
      const pane = page.locator(".terminal-focus__pane").nth(index);
      await pane.locator(".xterm-helper-textarea").focus();
      await page.keyboard.insertText(`echo AURIS_FOCUS_${index}_中文`);
      await page.keyboard.press("Enter");
    }
    await expect.poll(async () => {
      const records = await live();
      return records.every((record, index) => new RegExp(`(?:^|[\\r\\n])AURIS_FOCUS_${index}_中文[\\r\\n]`).test(stripVTControlCharacters(record.output ?? "")));
    }, { timeout: 20000 }).toBe(true);
    evidence.checks.push("Keyboard input, independent output and Unicode work in all eight panels");
    await page.getByLabel("终端分屏列数").selectOption("4");
    const before = await live();
    const separator = page.getByRole("separator", { name: "调整第 1 列宽度" });
    const bounds = await separator.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 90);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + 90, { steps: 12 }); await page.mouse.up();
    await expect.poll(async () => {
      const current = await live();
      return current[0].cols !== before[0].cols && current[1].cols !== before[1].cols;
    }).toBe(true);
    const geometry = await page.evaluate(() => {
      const panes = [...document.querySelectorAll(".terminal-focus__pane")].map((pane) => pane.getBoundingClientRect());
      return [...document.querySelectorAll(".terminal-focus__separator")].map((separator) => {
        const bounds = separator.getBoundingClientRect();
        const column = separator.classList.contains("terminal-focus__separator--column");
        const siblings = [...document.querySelectorAll(column ? ".terminal-focus__separator--column" : ".terminal-focus__separator--row")];
        const index = siblings.indexOf(separator);
        const expected = column ? (panes[index].right + panes[index + 1].left) / 2 : (panes[index * 4].bottom + panes[(index + 1) * 4].top) / 2;
        const actual = column ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2;
        return { axis: column ? "column" : "row", index, expected, actual };
      });
    });
    assert.equal(geometry.every((entry) => Math.abs(entry.expected - entry.actual) < 1), true, JSON.stringify(geometry));
    evidence.checks.push("Unequal column/row separator hitboxes align with actual Grid gaps within 1px");
    const afterDrag = await live();
    assert.equal(afterDrag.every((record) => record.rows > 0 && record.cols > 0), true);
    evidence.checks.push("Native PTY geometry updates for both columns after dragging separator");
    await page.getByRole("button", { name: "专注 Terminal 3", exact: true }).click();
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(1);
    await page.getByRole("button", { name: "恢复全部分屏", exact: true }).click();
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(8);
    assert.deepEqual((await live()).map((record) => record.id), initial.map((record) => record.id));
    evidence.checks.push("Maximize/restore preserves all PTY identities");
    await page.getByRole("button", { name: "搜索当前终端", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索终端内容" }).fill("AURIS_FOCUS");
    await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
    await page.screenshot({ path: path.join(output, "terminal-eight-night.png") });
    const palettes = {};
    for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
      await page.evaluate((theme) => {
        localStorage.setItem("auris.notes.reading-theme", theme);
        window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: theme }));
      }, theme);
      await expect(page.locator(".terminal-focus")).toHaveAttribute("data-notes-theme", theme);
      palettes[theme] = await page.locator(".terminal-focus").evaluate((element) => ({ background: getComputedStyle(element).getPropertyValue("--notes-terminal-bg").trim(), foreground: getComputedStyle(element).getPropertyValue("--notes-terminal-fg").trim() }));
      assert.ok(palettes[theme].background);
      assert.ok(palettes[theme].foreground);
    }
    evidence.palettes = palettes;
    evidence.checks.push("All six existing Notes themes resolve terminal colors");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: "night" })));
    await page.getByRole("link", { name: "本地笔记", exact: true }).click();
    await expect(page).toHaveURL(/\/notes/);
    await expect.poll(async () => (await live()).length).toBe(8);
    await page.goto(`${url}/terminal`);
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(8);
    assert.deepEqual((await live()).map((record) => record.id), initial.map((record) => record.id));
    evidence.checks.push("Notes navigation leaves PTYs alive; terminal route reattaches same eight sessions");
    assert.equal(fs.readFileSync(note, "utf8"), source);
    evidence.checks.push("Temporary Notes fixture remains unchanged");
    evidence.sessions = (await live()).map(({ id, backend, cols, rows }) => ({ id, backend, cols, rows }));
    evidence.ok = true;
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    evidence.ok = false; evidence.failure = error.stack; console.error(error);
    if (app) {
      const page = app.windows().find((page) => page.url().includes("/terminal"));
      if (page) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    save();
    if (app) await app.close().catch(() => {});
    server.kill("SIGTERM"); fs.closeSync(log);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
