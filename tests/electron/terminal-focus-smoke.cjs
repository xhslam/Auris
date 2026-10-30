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
  const projectA = path.join(profile, "中文 项目 A");
  const projectB = path.join(profile, "项目 B ");
  fs.mkdirSync(path.join(profile, "项目 B")); // Unselected sibling must never replace the selected trailing-space cwd.
  const denied = path.join(profile, "not-selected");
  for (const directory of [projectA, projectB, denied]) fs.mkdirSync(directory);
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
  const packagedApp = process.argv.includes("--app") ? path.resolve(process.argv[process.argv.indexOf("--app") + 1]) : null;
  const port = 34919;
  let url = `http://127.0.0.1:${port}`;
  let server, log;
  if (packagedApp) {
    delete env.SHADOWING_DESKTOP_URL;
  } else {
    log = fs.openSync(path.join(output, "next.log"), "w");
    server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...(process.argv.includes("--dev-server") ? ["dev", "--webpack"] : ["start"]), "-p", String(port), "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  }
  const evidence = { startedAt: new Date().toISOString(), checks: [], errors: [], profile };
  let app;
  const save = () => fs.writeFileSync(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  try {
    if (!packagedApp) {
      await expect.poll(async () => { try { return (await fetch(url)).status; } catch { return 0; } }, { timeout: process.argv.includes("--dev-server") ? 120000 : 30000 }).toBe(200);
      env.SHADOWING_DESKTOP_URL = url;
      if (process.argv.includes("--dev-server")) {
        // Warm the large Notes and terminal client graphs before the native
        // startup timeout; this is dev compilation, never a production build.
        for (const route of ["/notes", "/terminal"]) {
          const response = await fetch(url + route, { signal: AbortSignal.timeout(120000) });
          assert.equal(response.status, 200, `Dev route ${route} must compile`);
          await response.arrayBuffer();
        }
      }
    }
    app = await _electron.launch(packagedApp ? {
      executablePath: path.join(packagedApp, "Contents/MacOS/Auris"), args: [note], env, timeout: 60000,
    } : { args: [path.join(root, "electron/main.cjs"), "--dev", note], env, timeout: 60000 });
    let page;
    await expect.poll(() => {
      page = app.windows().find((candidate) => /\/notes(?:[/?#]|$)/.test(candidate.url()));
      return Boolean(page);
    }, { timeout: 60000 }).toBe(true);
    if (packagedApp) url = new URL(page.url()).origin;
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
    await expect(page.getByRole("heading", { name: "开始一个终端会话" })).toBeVisible();
    assert.equal((await live()).length, 0);
    // Exercise the actual IPC handler with deterministic native-dialog results.
    // No production test bypass is added, and arbitrary renderer grants remain impossible.
    await app.evaluate(({ dialog }, choices) => {
      dialog.showOpenDialog = async () => choices.shift() ?? { canceled: true, filePaths: [] };
    }, [{ canceled: true, filePaths: [] }, { canceled: false, filePaths: [projectA] }, { canceled: false, filePaths: [projectB] }]);
    const openNew = () => page.getByRole("button", { name: "新建终端", exact: true }).first().click();
    await openNew();
    await page.getByRole("button", { name: "选择文件夹…", exact: true }).click();
    await expect(page.getByRole("button", { name: "选择文件夹…", exact: true })).toBeEnabled();
    assert.equal((await live()).length, 0);
    evidence.checks.push("Cancelling native project selection starts no Shell");
    await page.getByRole("button", { name: "选择文件夹…", exact: true }).click();
    await expect.poll(async () => (await live()).length).toBe(1);
    assert.equal((await live())[0].cwd, fs.realpathSync(projectA));
    await openNew();
    await expect(page.getByRole("dialog").getByRole("button", { name: /中文 项目 A/ })).toBeVisible();
    await page.screenshot({ path: path.join(output, "terminal-project-picker.png") });
    await page.getByRole("button", { name: "选择文件夹…", exact: true }).click();
    await expect.poll(async () => (await live()).length).toBe(2);
    assert.equal((await live())[1].cwd, fs.realpathSync(projectB));
    const recents = page.locator(".terminal-focus__recent-projects");
    await expect(recents).not.toHaveAttribute("open", "");
    await recents.locator("summary").click();
    await page.getByRole("button", { name: "在最近项目 中文 项目 A 中新建终端", exact: true }).click();
    await expect.poll(async () => (await live()).length).toBe(3);
    await recents.locator("summary").click();
    evidence.checks.push("Recent projects are initially collapsed and can create a project terminal directly");
    for (let count = 4; count <= 8; count++) {
      await openNew();
      await page.getByRole("dialog").getByRole("button", { name: /中文 项目 A/ }).click();
      await expect.poll(async () => (await live()).length).toBe(count);
    }
    const unauthorized = await page.evaluate(async ({ denied, scope }) => {
      try { await window.shadowingDesktop.terminal.create({ cwd: denied, workspaceInstanceId: scope, sessionId: "focus-denied-test" }); return false; }
      catch { return true; }
    }, { denied, scope });
    assert.equal(unauthorized, true);
    assert.equal((await live()).length, 8);
    evidence.checks.push("Outside-Vault cwd starts only after native selection; recents reuse grants; arbitrary IPC cwd rejected");
    const notesProbe = await page.evaluate(async ({ projectA }) => {
      const record = await window.shadowingDesktop.terminal.create({ cwd: projectA, workspaceInstanceId: "smoke-notes", sessionId: "notes-project-policy-probe" });
      await window.shadowingDesktop.terminal.kill(record.id);
      return record.cwd;
    }, { projectA });
    assert.equal(fs.realpathSync(notesProbe), fs.realpathSync(vault));
    evidence.checks.push("Terminal project grants do not broaden Notes cwd or change its Vault");
    await expect(page.getByRole("button", { name: "新建终端", exact: true })).toBeDisabled();
    const initial = await live();
    assert.equal(initial.every((record) => record.backend === "pty"), true, "Must use real PTY, not pipe fallback");
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(8);
    evidence.checks.push("8 real PTYs, 8 visible panels, ninth creation disabled");
    await expect(page.locator(".terminal-focus__project-group")).toHaveCount(2);
    const projectGroup = page.getByRole("group", { name: `启动项目：${fs.realpathSync(projectA)}`, exact: true });
    await projectGroup.getByRole("button", { expanded: true }).click();
    await expect(page.locator(".terminal-focus__pane:visible")).toHaveCount(8);
    assert.equal((await live()).length, 8);
    await projectGroup.getByRole("button", { expanded: false }).click();
    await expect(page.locator('.terminal-focus__session-row[data-visible="true"]')).toHaveCount(8);
    await expect(page.locator('.terminal-focus__session-row[data-active="true"]')).toHaveCount(1);
    await page.getByRole("button", { name: "重命名 Terminal 3", exact: true }).click();
    await page.getByRole("textbox", { name: "重命名 Terminal 3", exact: true }).fill("前端修复");
    await page.getByRole("button", { name: "保存会话名称", exact: true }).click();
    await expect(page.getByRole("tab", { name: "前端修复 · Terminal 3", exact: true })).toBeVisible();
    await expect.poll(async () => (await live()).find((record) => record.id === initial[2].id).customTitle).toBe("前端修复");
    evidence.checks.push("Sidebar groups by startup projects; collapse preserves PTYs; manual rename persists without shell input");
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
    await page.locator(".terminal-focus__pane").nth(0).locator(".xterm-helper-textarea").focus();
    await page.keyboard.insertText("pwd"); await page.keyboard.press("Enter");
    await expect.poll(async () => stripVTControlCharacters((await live())[0].output ?? "").split(/\r?\n/).includes(fs.realpathSync(projectA))).toBe(true);
    evidence.checks.push("Actual Shell pwd matches the independently selected project");
    await page.locator(".terminal-focus__pane").nth(1).locator(".xterm-helper-textarea").focus();
    await page.keyboard.insertText("pwd"); await page.keyboard.press("Enter");
    await expect.poll(async () => stripVTControlCharacters((await live())[1].output ?? "").split(/\r?\n/).includes(fs.realpathSync(projectB))).toBe(true);
    evidence.checks.push("Trailing-space project cwd is preserved at real PTY spawn, never the unselected sibling");
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
    await expect(page.locator('.terminal-focus__session-row[data-visible="true"]')).toHaveCount(1);
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
    await expect(page.getByRole("tab", { name: "前端修复 · Terminal 3", exact: true })).toBeVisible();
    evidence.checks.push("Notes navigation leaves PTYs alive; terminal route reattaches same eight sessions and manual title");
    assert.deepEqual((await live()).map((record) => record.cwd), initial.map((record) => record.cwd));
    const previousThirdId = initial[2].id;
    await page.getByRole("button", { name: "重启 Terminal 3", exact: true }).click();
    await expect.poll(async () => (await live()).some((record) => record.id === previousThirdId)).toBe(false);
    await expect.poll(async () => (await live()).length).toBe(8);
    const currentThirdId = await page.locator(".terminal-focus__pane").nth(2).getAttribute("data-session-id");
    assert.equal((await live()).find((record) => record.id === currentThirdId).cwd, fs.realpathSync(projectA));
    evidence.checks.push("Route restoration and explicit restart preserve each session's original project cwd");
    assert.equal((await live()).find((record) => record.id === currentThirdId).customTitle, "前端修复");
    const beforeAppRestart = (await live()).map(({ id, cwd, customTitle }) => ({ id, cwd, customTitle: customTitle ?? null })).sort((a, b) => a.id.localeCompare(b.id));
    await app.close();
    app = await _electron.launch(packagedApp ? {
      executablePath: path.join(packagedApp, "Contents/MacOS/Auris"), args: [note], env, timeout: 60000,
    } : { args: [path.join(root, "electron/main.cjs"), "--dev", note], env, timeout: 60000 });
    await expect.poll(() => {
      page = app.windows().find((candidate) => /\/notes(?:[/?#]|$)/.test(candidate.url()));
      return Boolean(page);
    }, { timeout: 60000 }).toBe(true);
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.locator(".ProseMirror p").first().waitFor({ timeout: 60000 });
    if (packagedApp) url = new URL(page.url()).origin;
    await page.goto(`${url}/terminal`);
    await expect.poll(async () => (await live()).length, { timeout: 20000 }).toBe(8);
    assert.deepEqual((await live()).map(({ id, cwd, customTitle }) => ({ id, cwd, customTitle: customTitle ?? null })).sort((a, b) => a.id.localeCompare(b.id)), beforeAppRestart);
    const restoredSpaceProject = (await live()).find((record) => record.cwd === fs.realpathSync(projectB));
    await page.locator(`[data-session-id="${restoredSpaceProject.id}"] .xterm-helper-textarea`).focus();
    await page.keyboard.insertText("pwd"); await page.keyboard.press("Enter");
    await expect.poll(async () => stripVTControlCharacters((await live()).find((record) => record.id === restoredSpaceProject.id).output ?? "").split(/\r?\n/).includes(fs.realpathSync(projectB))).toBe(true);
    await expect(page.getByRole("tab", { name: /^前端修复 · Terminal/ })).toBeVisible();
    evidence.checks.push("Full application restart restores project grants, manual titles and all eight cwd values, including the trailing-space path");
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
    server?.kill("SIGTERM"); if (log !== undefined) fs.closeSync(log);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
