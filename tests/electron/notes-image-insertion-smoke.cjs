"use strict";
// Real Electron + existing Vault IPC; never touches the user's Vault/profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const out = path.join(root, "release/notes-image-insertion-smoke");

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
  // Synthetic landscape fixture, visibly distinct from a loading placeholder.
  for (let y = 0; y < 400; y++) {
    rows[y * (640 * 3 + 1)] = 0;
    for (let x = 0; x < 640; x++) {
      const hill = y > 260 + Math.sin(x / 85) * 42;
      const mountain = y > 210 + Math.sin(x / 125 + 1) * 64;
      const sun = (x - 470) ** 2 + (y - 95) ** 2 < 34 ** 2;
      const color = sun ? [255, 218, 135] : hill ? [41, 91, 76] : mountain ? [92, 139, 132] : [142 + Math.round(y / 8), 188 + Math.round(y / 12), 207];
      const pixel = y * (640 * 3 + 1) + 1 + x * 3;
      for (let channel = 0; channel < 3; channel++) rows[pixel + channel] = color[channel];
    }
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-insert-images-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData);
  const fixture = path.join(vault, "图片拖放演示.md");
  fs.writeFileSync(fixture, "# 图片拖放演示\n\n这段文字在图片上方。\n\n这段文字在图片下方。\n");
  const bytes = png();
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { enabled: false, startOnLaunch: false } }));
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34886" };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "34886", "--hostname", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", log, log] });
  const evidence = { checks: [], rendererErrors: [], isolatedProfile: true };
  let app;
  let page;
  const launch = async () => {
    app = await _electron.launch({ args: [path.join(root, "electron/main.cjs"), "--dev", fixture], env, timeout: 60000 });
    await expect.poll(() => app.windows().some(page => /\/notes(?:[/?#]|$)/.test(page.url())), { timeout: 60000 }).toBe(true);
    const page = app.windows().find(page => /\/notes(?:[/?#]|$)/.test(page.url()));
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.rendererErrors.push(error.message));
    const native = await app.browserWindow(page);
    await native.evaluate(window => window.setSize(1280, 900));
    await page.locator(".ProseMirror").waitFor({ state: "visible" });
    return page;
  };
  try {
    await expect.poll(async () => { if (server.exitCode !== null) throw new Error("Next exited"); try { return (await fetch(env.SHADOWING_DESKTOP_URL + "/notes")).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
    page = await launch();
    await expect(page.getByRole("button", { name: "插入图片", exact: true })).toHaveCount(0);
    const editor = page.locator(".ProseMirror");
    // Deliberately keep the current caret elsewhere: the drop coordinates,
    // not the current selection, must decide which line receives the image.
    await editor.locator("p").first().click();
    await editor.evaluate((element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], "landscape.png", { type: "image/png" }));
      const target = [...element.querySelectorAll("p")].find(node => node.textContent === "这段文字在图片下方。");
      const bounds = target.getBoundingClientRect();
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left + 1, clientY: bounds.top + 5 }));
    }, [...bytes]);
    const actualImages = () => page.locator(".ProseMirror img:not(.ProseMirror-separator)");
    await expect(actualImages()).toHaveCount(1);
    await expect.poll(() => actualImages().first().evaluate(img => img.naturalWidth)).toBe(640);
    const order = await editor.evaluate(element => [...element.children].map(node => node.querySelector("img:not(.ProseMirror-separator)") ? "IMAGE" : node.textContent));
    assert.deepEqual(order, ["图片拖放演示", "这段文字在图片上方。", "IMAGE", "这段文字在图片下方。"]);
    await expect.poll(() => (fs.readFileSync(fixture, "utf8").match(/!\[/g) || []).length, { timeout: 15000 }).toBe(1);
    evidence.checks.push("无按钮；按拖放坐标在指定段落前独立显示图片，当前光标及上下文不干扰落点");
    const saved = fs.readFileSync(fixture, "utf8");
    evidence.directory = await page.evaluate(() => window.shadowingDesktop.vault.getDirectoryInfo());
    evidence.source = saved;

    assert(!saved.includes("data:") && !saved.includes("blob:") && !saved.includes("shadowing-media:"));
    for (const asset of fs.readdirSync(path.join(vault, "assets"))) assert.deepEqual(fs.readFileSync(path.join(vault, "assets", asset)), bytes);
    evidence.checks.push("真实 IPC 保存图片附件，Markdown 保留独立图片行和上下方原文");
    await page.screenshot({ path: path.join(out, "inserted.png") });
    await app.close(); app = null;
    page = await launch();
    await expect(actualImages()).toHaveCount(1);
    await expect.poll(() => actualImages().evaluateAll(images => images.every(img => img.naturalWidth === 640))).toBe(true);
    assert.equal(fs.readFileSync(fixture, "utf8"), saved);
    evidence.checks.push("关闭并重新启动应用后图片仍在原位置正常显示，原文不被改写");
    await page.screenshot({ path: path.join(out, "reopened.png") });
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (page && !page.isClosed()) {
      evidence.images = await page.locator(".ProseMirror img").evaluateAll(images => images.map(img => ({ src: img.getAttribute("src"), width: img.naturalWidth, pending: img.dataset.notesImagePending })));
      evidence.files = fs.readdirSync(vault, { recursive: true });
      await page.screenshot({ path: path.join(out, "failed.png") });
    }
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close();
    server.kill(); fs.closeSync(log);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
