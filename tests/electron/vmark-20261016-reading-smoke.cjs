"use strict";

// Real production renderer + isolated Electron profile + temporary Vault only.
// VMark #1561 adapted to Auris: reading pixels and explicit jumps are distinct.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const outIndex = process.argv.indexOf("--out");
const out = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : "release/vmark-20261016-reading-smoke");

async function main() {
  assert.equal(process.platform, "darwin", "This source-Electron probe runs on macOS.");
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-reading-20261016-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const firstPath = path.join(vault, "阅读甲.md");
  const secondPath = path.join(vault, "阅读乙.md");
  const firstSource = "# 阅读甲\n\n" + Array.from({ length: 80 }, (_, index) => `## 章节${index + 1}\n\n阅读段落 ${index + 1}。光标仍在开头，阅读视口可以独立移动。\n\n`).join("");
  const secondSource = "# 阅读乙\n\n切换用的第二篇临时笔记。\n";
  fs.writeFileSync(firstPath, firstSource); fs.writeFileSync(secondPath, secondSource);
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({
    vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {},
    mcp: { enabled: false, startOnLaunch: false },
  }));
  const evidence = { upstream: "8887701db097cef0dea00584b70a0ea1dac5ae05", checks: [], rendererErrors: [], isolatedProfile: true };
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34881" };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34881", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  let app;
  let page;
  try {
    await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error(`Next exited ${server.exitCode}`);
      try { return (await fetch(env.SHADOWING_DESKTOP_URL)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    app = await _electron.launch({ args: [path.join(root, "electron/main.cjs"), "--dev", firstPath], env, timeout: 60000 });
    await expect.poll(() => app.windows().some((window) => /\/notes(?:[/?#]|$)/.test(window.url())), { timeout: 60000 }).toBe(true);
    page = app.windows().find((window) => /\/notes(?:[/?#]|$)/.test(window.url()));
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => evidence.rendererErrors.push(error.message));
    const native = await app.browserWindow(page);
    await native.evaluate((window) => { window.setSize(1440, 900); window.show(); });
    await page.locator(".ProseMirror").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "大纲", exact: true }).click();
    await page.locator(".notes-v2__outline-button").filter({ hasText: /^章节1$/ }).waitFor();

    // No hardcoded ancestor: use the same physical overflow rule as the hook.
    const viewport = async (action) => page.evaluate((action) => {
      const richHost = document.querySelector('[data-testid="notes-prosemirror-host"]');
      const sourceHost = document.querySelector('[data-testid="notes-codemirror-host"]');
      const host = richHost ?? sourceHost;
      let container = sourceHost?.querySelector(".cm-scroller") ?? host;
      while (container && !(sourceHost && container.classList.contains("cm-scroller"))) {
        if (["auto", "scroll"].includes(getComputedStyle(container).overflowY)) break;
        container = container.parentElement;
      }
      if (!container) throw new Error("No physical editor scroll container");
      if (action === "read") {
        // End any mount restore as a reader gesture would, then record a real
        // scroll event. No source content is edited by this fixture.
        container.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
        container.scrollTop = 1800;
        container.dispatchEvent(new Event("scroll"));
      }
      if (action === "caret") {
        if (richHost) {
          const view = richHost.__notesRichEditorView;
          const selection = view.state.selection.constructor.near(view.state.doc.resolve(1));
          view.dispatch(view.state.tr.setSelection(selection));
        } else {
          sourceHost.__notesEditorView.dispatch({ selection: { anchor: 1 } });
        }
      }
      return { top: container.scrollTop, max: container.scrollHeight - container.clientHeight };
    }, action);
    const settleFrames = () => page.evaluate(async () => {
      // Outlive the existing restore's 90-frame lifecycle, not an arbitrary sleep.
      for (let frame = 0; frame < 96; frame += 1) await new Promise(requestAnimationFrame);
    });
    const switchAwayAndBack = async () => {
      // Minimal Notes has no always-visible file tree/tab strip. Exercise the
      // actual macOS open-file handler for two existing document sessions.
      await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), secondPath);
      await expect(page.getByRole("button", { name: "Open workspace switcher for 阅读乙", exact: true })).toBeVisible();
      await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), firstPath);
      await expect(page.getByRole("button", { name: "Open workspace switcher for 阅读甲", exact: true })).toBeVisible();
    };
    for (const mode of ["wysiwyg", "source"]) {
      if (mode === "source") {
        // Existing command infrastructure switches the one editable surface.
        await page.getByRole("button", { name: "More note actions", exact: true }).click();
        await page.getByRole("button", { name: "完整源码编辑", exact: true }).click();
        await page.locator(".cm-content").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "大纲", exact: true }).click();
      }
      await viewport("caret");
      const reading = await viewport("read");
      assert(reading.max > 1800, `${mode}: fixture must really scroll`);
      // The debounce flushes on unmount/path change, so switching immediately
      // also checks preservation of the last user-owned reading offset.
      await switchAwayAndBack();
      await expect.poll(async () => (await viewport()).top).toBeGreaterThan(1500);
      await settleFrames();
      assert(Math.abs((await viewport()).top - reading.top) < 5, `${mode}: return must restore reading position, not caret`);
      evidence.checks.push(`${mode}: switching documents restores reading position with caret present`);
      // Restart restore by switching tabs again, then trigger outline without a
      // pointerdown/wheel/keydown. This tests bridge cancellation itself.
      await switchAwayAndBack();
      await page.locator(".notes-v2__outline-button").filter({ hasText: /^章节1$/ }).evaluate((element) => element.click());
      await expect.poll(async () => (await viewport()).top).toBeLessThan(500);
      await settleFrames();
      assert((await viewport()).top < 500, `${mode}: an old restore reclaimed the explicit outline jump`);
      evidence.checks.push(`${mode}: explicit outline bridge jump outlives the previous restore`);
      await page.screenshot({ path: path.join(out, `${mode}-outline.png`) });
    }
    assert.equal(fs.readFileSync(firstPath, "utf8"), firstSource);
    assert.equal(fs.readFileSync(secondPath, "utf8"), secondSource);
    evidence.checks.push("temporary note bytes unchanged");
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (page) {
      try { fs.writeFileSync(path.join(out, "failure-dom.html"), await page.content()); } catch {}
      try { await page.screenshot({ path: path.join(out, "failure.png") }); } catch {}
    }
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close();
    server.kill(); fs.closeSync(log);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
