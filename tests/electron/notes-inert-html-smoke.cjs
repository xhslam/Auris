"use strict";

// Real Chromium side-effect check of the production Notes HTML import helper.
// VMark reference: src/utils/htmlToMarkdown.browser.test.ts, 2d3903cb2 (ISC).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { chromium } = require("playwright");

async function main() {
  const source = fs.readFileSync(path.resolve(__dirname, "../../src/features/notes/editor/notes-inert-html.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route("https://notes-import.test/**", async route => {
      requests.push(route.request().url());
      await route.fulfill({ status: 404, body: "missing" });
    });
    await page.addScriptTag({ content: `const exports = {};\n${compiled}\nwindow.notesImport = exports.createInertNotesHtmlContainer;` });
    const markup = '<img src="https://notes-import.test/beacon" onerror="window.importError = true"><script>window.importScript = true</script><b>text</b>';
    await page.evaluate(html => {
      window.importError = false;
      const control = document.createElement("div");
      control.innerHTML = html;
    }, markup);
    await page.waitForFunction(() => window.importError === true);
    assert.equal(requests.length, 1, "the live detached-element control must fetch the image");
    requests.length = 0;
    const result = await page.evaluate(html => {
      window.importError = false;
      window.importScript = false;
      const container = window.notesImport(html);
      return {
        hasBrowsingContext: container.ownerDocument.defaultView !== null,
        image: container.querySelector("img").getAttribute("src"),
        text: container.querySelector("b").textContent,
      };
    }, markup);
    await page.waitForTimeout(300);
    assert.deepEqual(result, { hasBrowsingContext: false, image: "https://notes-import.test/beacon", text: "text" });
    assert.deepEqual(requests, [], "inert import must not fetch resources");
    assert.deepEqual(await page.evaluate(() => [window.importError, window.importScript]), [false, false]);
    console.log(JSON.stringify({ browser: "Chromium", checks: 4, status: "passed", positiveControl: "image fetched and onerror ran" }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
