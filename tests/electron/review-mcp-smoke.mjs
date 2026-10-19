import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { _electron } from "playwright";
import { expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const { createMcpClientCredentialStore } = require("../../electron/mcp/client-credential-store.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outIndex = process.argv.indexOf("--out");
const out = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : "release/review-mcp-smoke");

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "auris-review-mcp-"));
  const userData = path.join(temporary, "user-data");
  const vault = path.join(temporary, "vault");
  fs.mkdirSync(userData); fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, "fixture.md"), "# MCP Smoke\n\nKeep this note unchanged.\n");
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({
    vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {},
    mcp: { enabled: true, startOnLaunch: true, autoApproveEdits: false },
  }));
  const discoveryPath = path.join(temporary, "discovery");
  const registryPath = path.join(temporary, "clients.json");
  const credential = await createMcpClientCredentialStore({ registryPath }).issue("review-smoke");
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData,
    AURIS_NOTES_MCP_PORT_FILE: discoveryPath, AURIS_MCP_CLIENT_CREDENTIALS_FILE: registryPath, SHADOWING_DESKTOP_URL: origin };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  const evidence = { isolatedProfile: true, checks: [], rendererErrors: [] };
  let app, client, transport;
  try {
    await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error(`Next exited ${server.exitCode}`);
      try { return (await fetch(origin)).status; } catch { return 0; }
    }, { timeout: 60000 }).toBe(200);
    app = await _electron.launch({ args: [path.join(root, "electron/main.cjs"), "--dev"], env, timeout: 60000 });
    await expect.poll(() => app.windows().some(page => page.url().startsWith(origin)), { timeout: 60000 }).toBe(true);
    const page = app.windows().find(page => page.url().startsWith(origin));
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.locator(".output-review-page").waitFor();
    evidence.bridge = await page.evaluate(() => ({
      present: Boolean(window.shadowingDesktop), review: typeof window.shadowingDesktop?.reviewMcp?.onRequest,
      runtime: document.querySelector(".desktop-app-shell")?.getAttribute("data-desktop-runtime"),
    }));
    page.on("console", message => { if (message.type() === "error") (evidence.consoleErrors ??= []).push(message.text()); });
    await expect.poll(() => fs.existsSync(discoveryPath)).toBe(true);
    transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, "electron/auris-notes-mcp-server.mjs")],
      env: { AURIS_NOTES_MCP_PORT_FILE: discoveryPath, AURIS_MCP_CLIENT_ID: credential.clientId, AURIS_MCP_CLIENT_TOKEN: credential.token }, stderr: "pipe" });
    client = new Client({ name: "review-smoke", version: "1" });
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(tool => tool.name);
    assert(tools.includes("auris_review") && tools.includes("auris_review_read"));
    evidence.checks.push("real stdio handshake and listTools");
    const call = async (name, args) => {
      const raw = await client.callTool({ name, arguments: args });
      assert(!raw.isError, JSON.stringify(raw));
      return raw.structuredContent.result;
    };
    await expect.poll(async () => {
      const raw = await client.callTool({ name: "auris_review_read", arguments: { action: "list_projects" } });
      return !raw.isError;
    }, { timeout: 20000 }).toBe(true);
    const created = await call("auris_review", { action: "create_project", name: "MCP 数学" });
    assert.equal(created.created, true);
    const reused = await call("auris_review", { action: "create_project", name: "MCP 数学" });
    assert.equal(reused.created, false);
    assert.equal(reused.project.id, created.project.id);
    const point = await call("auris_review", { action: "create_knowledge_point", project_id: created.project.id, title: "特征值与特征向量", start_date: "2026-10-19", notes: "桌面验收" });
    assert.deepEqual(point.cycle.events.map(event => event.currentPlannedDate), ["2026-10-20", "2026-10-21", "2026-10-23", "2026-10-26"]);
    await page.getByRole("button", { name: /^全部$/ }).click();
    await expect(page.getByText("特征值与特征向量", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(out, "review-created.png") });
    evidence.checks.push("project creation/reuse, point creation, four dates, live Review UI");
    const invalid = await client.callTool({ name: "auris_review", arguments: { action: "create_knowledge_point", project_id: "missing", title: "Must not create" } });
    assert.equal(invalid.isError, true);
    await page.goto(`${origin}/notes`);
    await page.locator(".notes-v2").first().waitFor();
    await expect.poll(async () => {
      const raw = await client.callTool({ name: "auris_review_read", arguments: { action: "list_projects" } });
      return !raw.isError;
    }, { timeout: 20000 }).toBe(true);
    const second = await call("auris_review", { action: "create_knowledge_point", project_id: created.project.id, title: "Notes 中创建" });
    assert.equal(second.created, true);
    // A Notes read must still get its own facade response, not Review's result.
    const notes = await client.callTool({ name: "auris_session", arguments: { action: "get_state" } });
    assert(!notes.isError, JSON.stringify(notes));
    assert(!JSON.stringify(notes.structuredContent).includes("Unsupported Review"));
    evidence.checks.push("Review creation while Notes is mounted; Notes request isolation");
    await page.goto(origin);
    await page.getByRole("button", { name: /^全部$/ }).click();
    await expect(page.getByText("Notes 中创建", { exact: true }).first()).toBeVisible();
    const queried = await call("auris_review_read", { action: "list_knowledge_points", project_id: created.project.id });
    assert.equal(queried.total, 2);
    const detail = await call("auris_review_read", { action: "get_knowledge_point", knowledge_point_id: point.knowledge_point.id });
    assert.equal(detail.cycles.length, 1);
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("auris.output-review.v1")));
    assert.equal(persisted.knowledgePoints.length, 2);
    assert.equal(persisted.cycles.length, 2);
    assert.equal(fs.readFileSync(path.join(vault, "fixture.md"), "utf8"), "# MCP Smoke\n\nKeep this note unchanged.\n");
    evidence.checks.push("reload persistence, project filter, detail cycles; note unchanged");
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (app) {
      evidence.windows = app.windows().map(page => page.url());
      const page = app.windows().find(page => page.url().startsWith(origin));
      if (page) {
        await page.screenshot({ path: path.join(out, "failure.png") }).catch(() => {});
        evidence.dom = await page.locator("body").innerText();
        evidence.bridgeAfter = await page.evaluate(() => ({ review: typeof window.shadowingDesktop?.reviewMcp?.onRequest, runtime: document.querySelector(".desktop-app-shell")?.getAttribute("data-desktop-runtime") }));
      }
    }
    throw error;
  } finally {
    if (client) await client.close().catch(() => {});
    if (transport) await transport.close().catch(() => {});
    if (app) await app.close();
    server.kill(); fs.closeSync(log);
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
