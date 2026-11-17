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
const out = path.join(root, "release/notes-image-preview-smoke");

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
  fs.mkdirSync(out, {recursive: true});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auris-image-preview-"));
  const vault = path.join(profile, "vault");
  const userData = path.join(profile, "user-data");
  fs.mkdirSync(vault); fs.mkdirSync(userData); fs.mkdirSync(path.join(vault, "附件"));
  const fixture = path.join(vault, "查看测试.md");
  const original = "# 查看测试\n\n原笔记内容不能改变。\n";
  fs.writeFileSync(fixture, original);
  const imageName = "中文 %20 图片.png";
  fs.writeFileSync(path.join(vault, "附件", imageName), png());
  fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), JSON.stringify({ vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {}, mcp: { enabled: false, startOnLaunch: false } }));
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: userData, SHADOWING_DESKTOP_URL: "http://127.0.0.1:34887" };
  delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(out, "server.log"), "w");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "-p", "34887", "--hostname", "127.0.0.1"], {cwd: root, env, stdio: ["ignore", log, log]});
  let app; let page;
  const evidence = { checks: [], rendererErrors: [], startupWarnings: [] };
  let previewStarted = false;
  try {
    await expect.poll(async () => { if (server.exitCode !== null) throw new Error("Next exited"); try { return (await fetch(env.SHADOWING_DESKTOP_URL + "/notes")).status; } catch { return 0; } }, {timeout: 120000}).toBe(200);
    app = await _electron.launch({args: [path.join(root, "electron/main.cjs"), "--dev", fixture], env, timeout: 60000});
    await expect.poll(() => app.windows().some(p => /\/notes(?:[/?#]|$)/.test(p.url())), {timeout: 60000}).toBe(true);
    page = app.windows().find(p => /\/notes(?:[/?#]|$)/.test(p.url()));
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => (previewStarted ? evidence.rendererErrors : evidence.startupWarnings).push(error.message));
    await page.locator(".ProseMirror").waitFor({state: "visible"});
    const editor = page.locator(".ProseMirror");
    await editor.evaluate(el => el.dataset.previewEditorIdentity = "preserved");
    previewStarted = true;
    await page.getByRole("button", {name: imageName, exact: true}).click();
    const panel = page.getByRole("region", {name: "图片查看", exact: true});
    const image = panel.getByRole("img");
    await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBe(640);
    await expect(editor).toBeHidden();
    evidence.checks.push("点击中文/空格/字面%20路径 PNG，安全协议实际解码 640px 图片，编辑器隐藏而非卸载");
    await panel.getByRole("button", {name: "原图", exact: true}).click();
    await expect(panel.getByText("100%", {exact: true})).toBeVisible();
    await panel.getByRole("button", {name: "放大图片"}).click();
    await expect(panel.getByText("125%", {exact: true})).toBeVisible();
    await panel.getByRole("button", {name: "适应窗口"}).click();
    const bounds = await image.boundingBox();
    assert(bounds && bounds.width > 0 && bounds.height > 0);
    await page.screenshot({path: path.join(out, "image-preview.png")});
    evidence.bounds = bounds;
    evidence.checks.push("原图/缩放/适应窗口可操作，截图确认真实可见图片");
    await panel.getByRole("button", {name: "关闭图片"}).click();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("data-preview-editor-identity", "preserved");
    assert.equal(fs.readFileSync(fixture, "utf8"), original);
    assert.deepEqual(fs.readFileSync(path.join(vault, "附件", imageName)), png());
    evidence.checks.push("关闭图片返回同一编辑器，Markdown 和 PNG 原文件完全未变");
    assert.deepEqual(evidence.rendererErrors, []);
    evidence.status = evidence.startupWarnings.length ? "passed-with-startup-warning" : "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = error.stack;
    if (page && !page.isClosed()) await page.screenshot({path: path.join(out, "failed.png")});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
    if (app) await app.close();
    server.kill(); fs.closeSync(log);
    fs.rmSync(profile, {recursive: true, force: true});
  }
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
