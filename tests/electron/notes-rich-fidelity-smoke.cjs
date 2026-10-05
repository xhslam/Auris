"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require("playwright");

async function main() {
  const index = process.argv.indexOf("--app");
  assert(index >= 0 && process.argv[index + 1], "Pass --app /path/to/Auris.app");
  const appPath = path.resolve(process.argv[index + 1]);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auris-rich-fidelity-"));
  const notePath = path.join(temporaryRoot, "Sync-Smoke.md");
  fs.writeFileSync(notePath, '# Sync-Smoke\n\n- one\n\n- two\n\n```ts title="demo.ts" {1,3}\nconst a = 1;\n```\n\n```mermaid title="flow"\ngraph TD; A-->B\n```\n\nfixture\n');
  const env = { ...process.env, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: path.join(temporaryRoot, "user-data") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SHADOWING_DESKTOP_URL;
  let app;
  try {
    app = await _electron.launch({ executablePath: path.join(appPath, "Contents/MacOS/Auris"), args: [notePath], env, timeout: 60_000 });
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.waitForURL("http://127.0.0.1:*/notes**", { timeout: 60_000 });
    const editor = page.locator(".ProseMirror").first();
    await editor.waitFor({ state: "visible", timeout: 60_000 });
    await editor.locator(".notes-v2__pm-code-block-preview svg").first().waitFor({ state: "attached", timeout: 30_000 });
    await editor.evaluate(element => {
      element.focus();
      const selection = window.getSelection();
      selection.selectAllChildren(element);
      selection.collapseToEnd();
    });
    await page.waitForTimeout(100);
    await page.keyboard.type("auris-smoke-edit");
    await page.keyboard.press("Meta+s");
    const deadline = Date.now() + 15_000;
    while (!fs.readFileSync(notePath, "utf8").includes("auris-smoke-edit") && Date.now() < deadline) await page.waitForTimeout(150);
    const saved = fs.readFileSync(notePath, "utf8");
    assert(saved.includes("auris-smoke-edit"), "Rich edit must reach disk");
    assert(saved.includes('```ts title="demo.ts" {1,3}'), "Code metadata must survive an unrelated edit");
    assert(saved.includes('```mermaid title="flow"'), "Preview metadata must survive an unrelated edit");
    assert(/[*-] one\n\n[*-] two/u.test(saved), "Loose list must remain loose");
    console.log(JSON.stringify({ appPath, appVersion: await app.evaluate(({ app: electronApp }) => electronApp.getVersion()), notesOpened: true, actualRichEditSaved: true, codeMetadataPreserved: true, looseListPreserved: true, mermaidWithMetadataRendered: true, temporaryNoteOnly: true, isolatedUserData: true }));
  } finally {
    if (app) await app.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
