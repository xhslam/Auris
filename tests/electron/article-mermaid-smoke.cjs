"use strict";
// Real Electron /notes with isolated userData and a temporary vault only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { _electron, expect } = require("@playwright/test");
const { createMcpClientCredentialStore } = require("../../electron/mcp/client-credential-store.cjs");
const root = path.resolve(__dirname, "../..");
const out = path.join(root, "release/article-mermaid-smoke");

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "auris-article-mermaid-")));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const fixture = path.join(vault, "文章图验收.md");
  const original = "# 文章图验收\n\n学习包含理解、练习和复盘。\n";
  fs.writeFileSync(fixture, original);
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({
    vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {},
    mcp: { autoApproveEdits: false, enabled: true, startOnLaunch: true },
  }));
  const registryPath = path.join(profile, "clients.json");
  const credential = await createMcpClientCredentialStore({ registryPath }).issue("article-mermaid-smoke");
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData,
    AURIS_NOTES_MCP_PORT_FILE: path.join(profile, "mcp-port"),
    AURIS_MCP_CLIENT_CREDENTIALS_FILE: registryPath,
    AURIS_MCP_CLIENT_ID: credential.clientId, AURIS_MCP_CLIENT_TOKEN: credential.token,
    SHADOWING_DESKTOP_URL: "http://127.0.0.1:34883" };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34883", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  const evidence = { checks: [], rendererErrors: [], isolatedProfile: true };
  let app, client;
  try {
    await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error("Next server exited");
      try { return (await fetch(env.SHADOWING_DESKTOP_URL + "/notes")).status; } catch { return 0; }
    }, { timeout: 60000 }).toBe(200);
    app = await _electron.launch({ args: [path.join(root, "electron/main.cjs"), "--dev"], env, timeout: 60000 });
    const page = await app.firstWindow();
    await page.goto(`${env.SHADOWING_DESKTOP_URL}/notes?resumeNoteId=${encodeURIComponent("文章图验收.md")}`);
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    await (await app.browserWindow(page)).evaluate(window => window.setSize(1280, 800));
    await page.locator(".ProseMirror").first().waitFor();
    const footer = page.locator(".notes-v2__corner-cluster--right");
    await expect(footer.locator("button.notes-v2__corner-icon")).toHaveCount(6);
    await expect(footer.getByRole("button", { name: "大纲", exact: true })).toHaveCount(0);
    await footer.getByRole("button", { name: "打开关系图", exact: true }).click();
    await expect(page.getByText("这篇文章还没有 Mermaid 图。", { exact: true })).toBeVisible();
    await page.getByText("查看生成指令", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Agent 生成指令" })).toHaveValue(/write_mermaid/);
    const bounds = await page.locator('[data-size="mermaid"]').boundingBox();
    const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert(bounds.width >= viewport.width * 0.9 && bounds.height >= viewport.height * 0.88, "diagram must use most of the viewport");
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1, "large panel must remain within the window");
    evidence.panelBounds = bounds;
    evidence.checks.push("six footer icons; no Outline; large 92vw x 90vh panel; empty state and path-specific Agent handoff");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    client = new Client({ name: "article-mermaid-smoke", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, "electron/auris-notes-mcp-server.mjs")], env, stderr: "pipe" }));
    const call = async (name, args) => {
      const raw = await client.callTool({ name, arguments: args });
      const text = raw.content.find(part => part.type === "text")?.text;
      const result = text ? JSON.parse(text) : raw;
      if (raw.isError) throw new Error(JSON.stringify(result));
      return result;
    };
    const read = await call("auris_document", { action: "read", tab_id: "文章图验收.md" });
    const write = await call("auris_document", { action: "write_mermaid", tab_id: read.tab_id, expected_revision: read.revision,
      content: 'flowchart LR\n A["理解"] --> B["练习"] --> C["复盘"]' });
    evidence.write = write;
    assert(write.pending_review, "must retain explicit MCP edit approval");
    assert.equal(fs.readFileSync(fixture, "utf8"), original);
    await page.getByRole("dialog", { name: "MCP edit review", exact: true }).getByRole("button", { name: "Apply edit", exact: true }).click();
    const graphButton = footer.getByRole("button", { name: "打开关系图", exact: true });
    if (await graphButton.getAttribute("aria-expanded") !== "true") await graphButton.click();
    evidence.afterApproval = await call("auris_document", { action: "read", tab_id: read.tab_id });
    await expect(page.locator('[data-testid="article-mermaid-svg"] svg')).toHaveCount(1);
    await expect(page.locator('[data-testid="article-mermaid-svg"]')).toContainText("理解");
    await call("auris_workspace", { action: "save", tab_id: read.tab_id });
    const saved = fs.readFileSync(fixture, "utf8");
    assert(saved.endsWith(original), "body must remain byte-identical");
    assert(saved.includes("aurisMermaid:"));
    evidence.checks.push("real MCP read/write_mermaid; pending approval; actual SVG; successful save and unchanged body");
    for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
      await page.evaluate(value => { localStorage.setItem("auris.notes.reading-theme", value); window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value })); }, theme);
      await expect(page.locator('[data-testid="article-mermaid-svg"] svg')).toHaveCount(1);
    }
    await page.getByRole("button", { name: "放大图", exact: true }).click();
    await expect(page.getByRole("button", { name: "重置图缩放" })).toHaveText("125%");
    await page.getByRole("button", { name: "重置图缩放" }).click();
    await page.screenshot({ path: path.join(out, "article-mermaid.png") });
    evidence.checks.push("six themes and zoom; screenshot captured");
    delete evidence.afterApproval; delete evidence.write;
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (app) {
      const page = app.windows().find(p => /\/notes/.test(p.url()));
      if (page) { await page.screenshot({ path: path.join(out, "failure.png") }); evidence.ui = await page.locator("body").innerText(); }
    }
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (client) await client.close();
    if (app) await app.close();
    server.kill(); fs.closeSync(log);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
