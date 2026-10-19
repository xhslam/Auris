"use strict";

// Production renderer, real Chromium layout/network, isolated profile and temporary Vault.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const argument = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
const packagedApp = argument("--app");
const out = path.resolve(argument("--out") || path.join(root, "release/vmark-20261019-image-smoke"));

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
function png() {
  const chunk = (type, data) => {
    const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(640, 0); header.writeUInt32BE(400, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((640 * 3 + 1) * 400, 180);
  for (let y = 0; y < 400; y++) rows[y * (640 * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
async function main() {
  assert.equal(process.platform, "darwin"); fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-vmark101-"));
  const vault = path.join(profile, "vault"); const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const requests = new Set(); const image = png();
  const images = http.createServer((request, response) => {
    requests.add(request.url); response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); response.end(image);
  });
  await new Promise(resolve => images.listen(0, "127.0.0.1", resolve));
  const imagePort = images.address().port;
  const firstPath = path.join(vault, "image-proof.md"); const secondPath = path.join(vault, "images-only.md");
  const firstSource = "# Image proof\n\n" + Array.from({ length: 120 }, (_, i) => `## Image ${i}\n\n![img-${i}](http://127.0.0.1:${imagePort}/mixed/${i}.png)\n\nParagraph ${i}.\n\n`).join("") + "END_MARKER\n";
  const secondSource = "# Images only\n\n" + Array.from({ length: 80 }, (_, i) => `![only-${i}](http://127.0.0.1:${imagePort}/only/${i}.png)\n\n`).join("") + "END_MARKER\n";
  fs.writeFileSync(firstPath, firstSource); fs.writeFileSync(secondPath, secondSource);
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { enabled: false, startOnLaunch: false } }));
  const evidence = { upstream: "449fbc3e0b25215b3e1e38079ca59999f7a06a2b", checks: [], rendererErrors: [], isolatedProfile: true };
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34883" };
  delete env.ELECTRON_RUN_AS_NODE;
  // A packaged run must start and exercise its own bundled standalone server.
  if (packagedApp) delete env.SHADOWING_DESKTOP_URL;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = packagedApp ? null : spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34883", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  let app; let page;
  try {
    if (server) await expect.poll(async () => { if (server.exitCode !== null) throw new Error("Next exited"); try { return (await fetch(env.SHADOWING_DESKTOP_URL)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
    app = await _electron.launch(packagedApp
      ? { executablePath: path.join(path.resolve(packagedApp), "Contents/MacOS/Auris"), args: [firstPath], env, timeout: 60000 }
      : { args: [path.join(root, "electron/main.cjs"), "--dev", firstPath], env, timeout: 60000 });
    evidence.app = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, path: app.getAppPath() }));
    await expect.poll(() => app.windows().some(window => /\/notes(?:[/?#]|$)/.test(window.url())), { timeout: 60000 }).toBe(true);
    page = app.windows().find(window => /\/notes(?:[/?#]|$)/.test(window.url())); page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    const native = await app.browserWindow(page); await native.evaluate(window => { window.setSize(1440, 900); window.show(); });
    await page.locator(".ProseMirror").waitFor({ state: "visible" });
    const first = page.locator('.ProseMirror img[alt="img-0"]');
    await expect.poll(() => first.evaluate(img => img.naturalWidth), { timeout: 20000 }).toBe(640);
    // Observe longer than a handful of frames to catch accidental eager loading of the batch.
    await page.evaluate(async () => { for (let i = 0; i < 96; i++) await new Promise(requestAnimationFrame); });
    const initiallyRequested = [...requests].filter(url => url.startsWith("/mixed/")).length;
    assert(initiallyRequested > 0 && initiallyRequested < 30, `120 image document opened with ${initiallyRequested} requests`);
    evidence.initialMixedRequests = initiallyRequested;
    await page.screenshot({ path: path.join(out, "rich-initial.png") });
    const last = page.locator('.ProseMirror img[alt="img-119"]');
    assert.equal(await last.getAttribute("src"), null, "offscreen last image must have no src");
    await last.scrollIntoViewIfNeeded();
    await expect.poll(() => last.evaluate(img => img.naturalWidth), { timeout: 20000 }).toBe(640);
    evidence.checks.push("rich: near images loaded, offscreen requests deferred, last image loads on scroll");

    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), secondPath);
    const onlyFirst = page.locator('.ProseMirror img[alt="only-0"]');
    await onlyFirst.waitFor({ state: "attached" });
    // Document switches can retain the physical scroller position. State explicitly
    // which viewport this probe measures instead of assuming it starts at zero.
    await page.locator('[data-testid="notes-prosemirror-host"]').evaluate(host => {
      host.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      host.scrollTop = 0; host.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => onlyFirst.evaluate(img => img.naturalWidth), { timeout: 20000 }).toBe(640);
    await page.evaluate(async () => { for (let i = 0; i < 96; i++) await new Promise(requestAnimationFrame); });
    const onlyRequests = [...requests].filter(url => url.startsWith("/only/")).length;
    assert(onlyRequests > 0 && onlyRequests < 30, `80 consecutive images opened with ${onlyRequests} requests`);
    evidence.consecutiveRequestsAfterSwitchAndTop = onlyRequests;
    const onlyLast = page.locator('.ProseMirror img[alt="only-79"]');
    // The switch may briefly expose the inherited bottom viewport before the
    // explicit top scroll, so this image may already have loaded legitimately.
    await onlyLast.scrollIntoViewIfNeeded();
    await expect.poll(() => onlyLast.evaluate(img => img.naturalWidth), { timeout: 20000 }).toBe(640);
    evidence.checks.push("rich: consecutive images retain placeholders and do not all start on open");

    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), firstPath);
    await page.locator('.ProseMirror img[alt="img-0"]').waitFor();
    await page.getByRole("button", { name: "More note actions", exact: true }).click();
    await page.getByRole("button", { name: "完整源码编辑", exact: true }).click();
    await page.locator(".cm-content").waitFor({ state: "visible" });
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="notes-codemirror-host"]');
      const view = host.__notesEditorView;
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    });
    // Full-source mode deliberately mounts no mixed-render widgets. Preserve that
    // contract; widget-level viewport integration is covered by component tests.
    assert.equal(await page.locator('.notes-v2__cm-image-preview-media').count(), 0);
    assert(await page.locator('.cm-content').innerText().then(text => text.includes("END_MARKER")));
    evidence.checks.push("full source remains raw text rather than enabling mixed image previews");
    assert.equal(fs.readFileSync(firstPath, "utf8"), firstSource); assert.equal(fs.readFileSync(secondPath, "utf8"), secondSource);
    evidence.checks.push("load, scroll and document/mode switching leave original note bytes unchanged");
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="notes-codemirror-host"]');
      const view = host.__notesEditorView;
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\nSOURCE_SAVE_PROOF" } });
    });
    await page.keyboard.press("Meta+s");
    await expect.poll(() => fs.readFileSync(firstPath, "utf8"), { timeout: 20000 }).toContain("SOURCE_SAVE_PROOF");
    assert(fs.readFileSync(firstPath, "utf8").includes(`/mixed/119.png`));
    assert.equal(fs.readFileSync(secondPath, "utf8"), secondSource);
    evidence.checks.push("confirmed source edit saves only the active temporary note and preserves image Markdown");
    await page.screenshot({ path: path.join(out, "source-saved.png") });
    assert.deepEqual(evidence.rendererErrors, []); evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack; evidence.requests = [...requests];
    if (app) evidence.windowUrls = app.windows().map(window => window.url());
    const startupLog = path.join(userData, "electron-startup.log");
    if (fs.existsSync(startupLog)) fs.copyFileSync(startupLog, path.join(out, "startup-on-failure.log"));
    if (page) { try { fs.writeFileSync(path.join(out, "failure-dom.html"), await page.content()); await page.screenshot({ path: path.join(out, "failure.png") }); } catch {} }
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close(); server?.kill(); fs.closeSync(log); images.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
