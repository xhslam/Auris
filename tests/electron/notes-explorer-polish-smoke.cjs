"use strict";

// Real preload + isolated profile/Vault. Never opens or edits user notes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require("playwright");

async function main() {
  const packagedApp = process.argv[2] === "--app" ? process.argv[3] : null;
  const url = packagedApp ? null : process.argv[2];
  assert(packagedApp || url, "Pass a renderer URL or --app /path/to/Auris.app");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auris-explorer-polish-"));
  const vault = path.join(root, "考研");
  const profile = path.join(root, "profile");
  fs.mkdirSync(path.join(vault, "自动控制原理", "习题"), { recursive: true });
  fs.mkdirSync(profile);
  const longName = "串联超前校正与稳定裕度的相关习题及逐题批改与失分复盘";
  const fixture = path.join(vault, "验收笔记.md");
  const files = {
    "验收笔记.md": "# 验收笔记\n\n隔离测试正文。\n",
    [`${longName}.md`]: `# ${longName}\n\n临时内容。\n`,
    "自动控制原理/习题/draft.md": "# draft\n\n筛选展开测试。\n",
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(vault, name), content);
  fs.writeFileSync(path.join(profile, "shadowing-desktop-config.json"), JSON.stringify({
    vaultPath: vault, knownVaultRoots: [vault], pluginsEnabled: {},
    mcp: { enabled: false, startOnLaunch: false, autoApproveEdits: false },
  }));
  const env = { ...process.env, SHADOWING_DESKTOP_URL: url, AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  if (packagedApp) delete env.SHADOWING_DESKTOP_URL;
  const evidence = { root, themes: [], pageErrors: [] };
  let app;
  try {
    app = await _electron.launch({
      ...(packagedApp ? { executablePath: path.join(path.resolve(packagedApp), "Contents/MacOS/Auris") } : {}),
      args: packagedApp ? [fixture] : [path.resolve(__dirname, "../../electron/main.cjs"), "--dev", fixture],
      env, timeout: 60000,
    });
    const deadline = Date.now() + 60000;
    let page;
    while (Date.now() < deadline) {
      page = app.windows().find(window => /\/notes(?:[/?#]|$)/.test(window.url()));
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(page, "Notes window must open");
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => evidence.pageErrors.push(error.message));
    await page.locator(".notes-explorer").waitFor();
    // OS-opened note and Vault share the same explorer but different document IDs.
    await page.locator('.notes-explorer button[title="自动控制原理"]').waitFor({ state: "visible" });
    const explorer = page.getByRole("complementary", { name: "笔记文件栏" });
    const more = explorer.locator("summary");
    await more.click();
    await explorer.getByRole("button", { name: "折叠全部文件夹", exact: true }).click();
    assert.equal(await explorer.getByRole("button", { name: "draft.md", exact: true }).count(), 0);
    await explorer.getByRole("searchbox").fill("draft");
    await explorer.getByRole("button", { name: "draft.md", exact: true }).waitFor({ state: "visible" });
    await explorer.getByRole("button", { name: "清空筛选", exact: true }).click();
    assert.equal(await explorer.getByRole("button", { name: "draft.md", exact: true }).count(), 0);
    await explorer.getByRole("searchbox").fill("不存在的匹配");
    await explorer.getByRole("status").filter({ hasText: "没有匹配的文件" }).waitFor();
    await explorer.getByRole("searchbox").press("Escape");
    assert.equal(await explorer.getByRole("searchbox").inputValue(), "");
    await more.click();
    await explorer.getByRole("button", { name: "刷新文件", exact: true }).click();
    await explorer.getByRole("button", { name: `${longName}.md`, exact: true }).click();
    for (const width of [1440, 1160]) {
      await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(w, 900), width);
      for (const theme of ["paper", "white", "mint", "sepia", "night", "solarized"]) {
        await page.evaluate(value => {
          localStorage.setItem("auris.notes.reading-theme", value);
          window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value }));
        }, theme);
        await page.waitForFunction(value => document.querySelector(".notes-v2")?.dataset.notesTheme === value, theme);
        await page.waitForTimeout(350); // Existing theme transitions must settle before measuring.
        const metrics = await explorer.evaluate(element => {
          const row = element.querySelector('.notes-v2__tree-file[data-active="true"]');
          const label = row?.querySelector(".notes-v2__tree-name");
          const search = element.querySelector('input[type="search"]');
          const style = row && getComputedStyle(row);
          return {
            width: element.getBoundingClientRect().width,
            scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
            rowHeight: row?.getBoundingClientRect().height,
            selectedBackground: style?.backgroundColor,
            fontSize: style?.fontSize,
            labelOverflow: label && getComputedStyle(label).textOverflow,
            truncated: label && label.scrollWidth > label.clientWidth,
            searchHeight: search.getBoundingClientRect().height,
            pageWidth: document.documentElement.clientWidth,
            pageScrollWidth: document.documentElement.scrollWidth,
          };
        });
        assert.equal(metrics.rowHeight, 32);
        assert.equal(metrics.fontSize, "14px");
        assert.equal(metrics.searchHeight, 32);
        assert.equal(metrics.labelOverflow, "ellipsis");
        assert(metrics.truncated, "Long filename must actually truncate");
        assert(metrics.scrollWidth <= metrics.clientWidth + 1, "Explorer must not overflow horizontally");
        assert(metrics.pageScrollWidth <= metrics.pageWidth + 1, "App must not overflow horizontally");
        evidence.themes.push({ windowWidth: width, theme, ...metrics });
        if (width === 1440 && ["paper", "night"].includes(theme)) await page.screenshot({ path: path.join(root, `${theme}.png`) });
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await explorer.locator(".notes-v2__tree-caret").first().evaluate(element => getComputedStyle(element).transitionDuration), "0s");
    await more.click();
    await explorer.getByRole("button", { name: "折叠全部文件夹", exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal(await explorer.locator("details").getAttribute("open"), null);
    for (const [name, content] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(vault, name), "utf8"), content, "Fixture content must stay unchanged");
    evidence.functionalChecksPassed = true;
    assert.deepEqual(evidence.pageErrors, []);
    evidence.success = true;
  } finally {
    if (app) await app.close();
    fs.writeFileSync(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
