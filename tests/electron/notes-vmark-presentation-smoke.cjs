"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { _electron } = require("playwright");

const FIXTURE = "# Notes 展示对照\n\n中文、English 和 2026 应当清晰排列，正文保持舒适的行距。\n\n## 按内容分配表格空间\n\n| 项目 | 说明与下一步 | 状态 |\n| --- | --- | --- |\n| 终端 | 直接使用真实 shell，保留 ANSI 颜色、光标和完整交互。 | 待验收 |\n| 文字 | 正文应舒展清晰，段落间距稳定，长段落也能轻松阅读。 | 进行中 |\n| 表格 | 短字段保持紧凑，较长的说明获得更多空间；窄窗口可以横向滚动。 | 待验收 |\n\n`inline code`\n";
const LONG_TITLE = "学习卡点与方法识别笔记：关于终端展示、中文表格与长标题状态栏空间分配的完整验收记录";
const FOOTER_REVIEW_FRONTMATTER = "---\naurisDependencySnapshot:\n  capturedAt: '2026-10-08T00:00:00Z'\n  dependencies:\n    - kind: source-note\n      path: missing-test-source.md\n      fingerprint: isolated-test-only\n  status: needs-review\n---\n\n";
const FOOTER_SCROLL_BODY = `${Array.from({ length: 16 }, (_, index) => `第 ${index + 1} 段：长笔记应能滚到末尾，正文最后一行不会被底部操作栏遮挡。`).join("\n\n")}\n\nAURIS_FOOTER_LAST_LINE 中文末行应完整可见。\n`;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

async function tableMetrics(page, selector) {
  return page.locator(selector).first().evaluate(table => {
    const row = table.rows[0];
    const style = getComputedStyle(table);
    const box = table.getBoundingClientRect();
    const wrappers = [];
    for (let parent = table.parentElement; parent && wrappers.length < 6; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      wrappers.push({ className: parent.className, width: parent.clientWidth, scrollWidth: parent.scrollWidth, overflowX: parentStyle.overflowX });
    }
    return {
      tableLayout: style.tableLayout,
      width: box.width,
      columns: Array.from(row.cells, cell => cell.getBoundingClientRect().width),
      fontSize: getComputedStyle(row.cells[0]).fontSize,
      documentWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      wrappers,
    };
  });
}

async function terminalGeometry(page) {
  return page.locator(".notes-v2__terminal-host").first().evaluate(host => {
    const screen = host.querySelector(".xterm-screen");
    const viewport = host.querySelector(".xterm-viewport");
    const hostRect = host.getBoundingClientRect();
    const screenRect = screen?.getBoundingClientRect();
    return {
      hostWidth: hostRect.width,
      hostHeight: hostRect.height,
      screenWidth: screenRect?.width,
      screenHeight: screenRect?.height,
      background: viewport ? getComputedStyle(viewport).backgroundColor : null,
      screenBackground: screen ? getComputedStyle(screen).backgroundColor : null,
      hostPadding: getComputedStyle(host).padding,
    };
  });
}

async function waitForTerminalFit(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector(".notes-v2__terminal-host");
    const active = Array.from(host?.querySelectorAll(".notes-v2__terminal-xterm") ?? []).find(element => getComputedStyle(element).display !== "none");
    const screen = active?.querySelector(".xterm-screen");
    if (!host || !screen) return false;
    const hostBox = host.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    return hostBox.width > 0 && screenBox.width >= hostBox.width - 64 && screenBox.width <= hostBox.width + 1 && screenBox.height >= hostBox.height - 36 && screenBox.height <= hostBox.height + 1;
  }, null, { timeout: 30_000 });
}

async function toggleTerminal(page) {
  await page.getByRole("button", { name: "打开终端面板", exact: true }).click();
}

async function waitForNotesWindow(app) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const page = app.windows().find(window => /^http:\/\/127\.0\.0\.1:\d+\/notes(?:[/?#]|$)/u.test(window.url()));
    if (page) return page;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop note did not open; windows: ${app.windows().map(window => window.url()).join(", ")}`);
}

async function runTerminalCommand(page, command) {
  await page.locator(".xterm-helper-textarea:visible").first().focus();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

async function waitForTerminalText(page, text) {
  await page.waitForFunction(expected => Array.from(document.querySelectorAll(".notes-v2__terminal-xterm")).some(host => getComputedStyle(host).display !== "none" && Array.from(host.querySelectorAll(".xterm-rows > div")).some(row => row.textContent.trim().startsWith(expected))), text);
}

async function setTheme(page, theme) {
  await page.evaluate(value => {
    localStorage.setItem("auris.notes.reading-theme", value);
    window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value }));
  }, theme);
  await page.waitForFunction(value => document.querySelector(".notes-v2")?.dataset.notesTheme === value, theme);
  await page.waitForTimeout(100);
}

async function wakeFooter(page) {
  await page.locator(".ProseMirror p").first().click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".notes-v2");
    const right = root?.querySelector(".notes-v2__corner-cluster--right");
    return root?.dataset.interfaceActive === "true" && right && Number(getComputedStyle(right).opacity) > 0.95;
  });
}

async function footerMetrics(page) {
  return page.locator(".notes-v2__status-footer").evaluate(footer => {
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    };
    const left = footer.querySelector(".notes-v2__corner-cluster--left");
    const right = footer.querySelector(".notes-v2__corner-cluster--right");
    const title = footer.querySelector(".notes-v2__active-note-title");
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      sidebarExpanded: document.querySelector(".desktop-app-sidebar")?.dataset.expanded,
      footer: box(footer), left: box(left), right: box(right),
      clusterOffsets: [left, right].map(element => ({ left: getComputedStyle(element).left, right: getComputedStyle(element).right, position: getComputedStyle(element).position })),
      title: { text: title.textContent, clientWidth: title.clientWidth, scrollWidth: title.scrollWidth, textOverflow: getComputedStyle(title).textOverflow, whiteSpace: getComputedStyle(title).whiteSpace },
      actionCount: right.querySelectorAll(".notes-v2__corner-icon").length,
      reviewVisible: Array.from(right.querySelectorAll("button[data-attention]")).some(element => getComputedStyle(element).display !== "none"),
      saveStateVisible: Array.from(right.querySelectorAll("[data-save-state]")).some(element => getComputedStyle(element).display !== "none"),
      editorPaddingBottom: getComputedStyle(document.querySelector(".notes-v2__editor-pane")).paddingBottom,
      detailsHidden: Array.from(right.querySelectorAll("[data-footer-detail]")).every(element => getComputedStyle(element).display === "none"),
      buttons: Array.from(footer.querySelectorAll("button")).filter(button => button.getClientRects().length > 0).map(button => {
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { name: button.getAttribute("aria-label"), disabled: button.disabled, box: box(button), hit: button === hit || button.contains(hit), hitTag: hit?.tagName, hitClass: hit?.className };
      }),
    };
  });
}

function assertFooter(metrics, context) {
  const overlapWidth = Math.min(metrics.left.right, metrics.right.right) - Math.max(metrics.left.x, metrics.right.x);
  const overlapHeight = Math.min(metrics.left.bottom, metrics.right.bottom) - Math.max(metrics.left.y, metrics.right.y);
  assert(overlapWidth <= 1 || overlapHeight <= 1, `${context}: left and right footer clusters must not overlap`);
  assert(metrics.clusterOffsets.every(offset => ["0px", "auto"].includes(offset.left) && ["0px", "auto"].includes(offset.right)), `${context}: relative clusters must not retain legacy absolute offsets`);
  assert.equal(metrics.actionCount, 7, `${context}: all seven footer actions must remain available`);
  assert(metrics.saveStateVisible, `${context}: save state must remain visible`);
  assert(metrics.reviewVisible, `${context}: learning dependency review must remain visible`);
  assert(parseFloat(metrics.editorPaddingBottom) >= 80, `${context}: editor must reserve space for a two-row footer`);
  assert(metrics.footer.height <= parseFloat(metrics.editorPaddingBottom), `${context}: footer must remain within the editor's reserved space`);
  assert(metrics.detailsHidden, `${context}: split panes should hide optional metadata`);
  assert.equal(metrics.title.textOverflow, "ellipsis", `${context}: long title must use ellipsis`);
  assert(metrics.title.clientWidth > 0 && metrics.title.scrollWidth > metrics.title.clientWidth, `${context}: long title must actually be constrained`);
  assert(metrics.documentScrollWidth <= metrics.viewportWidth + 1, `${context}: footer must not widen the application`);
  for (const button of metrics.buttons) {
    assert(button.hit, `${context}: center of ${button.name} must hit that actual button`);
    assert(button.box.x >= 0 && button.box.right <= metrics.viewportWidth + 1, `${context}: ${button.name} must remain inside the viewport`);
  }
}

async function clickFooterButton(page, name) {
  await wakeFooter(page);
  const button = page.getByRole("button", { name, exact: true });
  const box = await button.boundingBox();
  assert(box && box.width > 0 && box.height > 0, `${name} needs a rendered hit target`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function verifySyntheticSaveLabel(page, setWidth, evidence, check = callback => callback()) {
  evidence.syntheticSaveConflictGeometry = [];
  for (const width of [1160, 900]) {
    await setWidth(width);
    await page.waitForFunction(nextWidth => document.documentElement.clientWidth === nextWidth, width);
    // Growing after the 900px case retains its narrow PTY width. Use the actual
    // splitter control to stress the widest permitted terminal at this width.
    const splitter = page.getByRole("separator", { name: "调整终端宽度", exact: true });
    let previousWidth = Number(await splitter.getAttribute("aria-valuenow"));
    for (let step = 0; step < 20 && previousWidth < 620; step += 1) {
      await splitter.press("ArrowLeft");
      const currentWidth = Number(await splitter.getAttribute("aria-valuenow"));
      if (currentWidth === previousWidth) break;
      previousWidth = currentWidth;
    }
    await wakeFooter(page);
    const original = await page.locator("[data-save-state]").evaluate(element => {
      const value = { text: element.textContent, state: element.getAttribute("data-save-state") };
      element.textContent = "保存冲突";
      element.setAttribute("data-save-state", "conflict");
      return value;
    });
    try {
      const metrics = await footerMetrics(page);
      evidence.syntheticSaveConflictGeometry.push({ width, terminalWidth: Number(await splitter.getAttribute("aria-valuenow")), expanded: true, syntheticLabelOnly: true, ...metrics });
      check(() => assertFooter(metrics, `synthetic conflict label at ${width}px`), `synthetic conflict label at ${width}px`);
    } finally {
      await page.locator("[data-save-state]").evaluate((element, value) => {
        element.textContent = value.text;
        element.setAttribute("data-save-state", value.state);
      }, original);
    }
  }
}

async function verifyFooterBoundary(app, page, evidence, diagnostic = false) {
  const check = (callback, context) => {
    try { callback(); }
    catch (error) {
      if (!diagnostic) throw error;
      (evidence.diagnosticErrors ??= []).push({ context, message: error.message });
    }
  };
  await setTheme(page, "paper");
  await page.evaluate(() => {
    const value = { focusDim: 0, hideStatus: true, titlebarName: true };
    localStorage.setItem("auris.appearance.window-preferences.v1", JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("auris:appearance-window-preferences", { detail: value }));
  });
  await page.waitForFunction(() => document.querySelector(".notes-v2")?.dataset.autoHideStatus === "true");
  await page.locator(".ProseMirror p").first().click();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => {
    const root = document.querySelector(".notes-v2");
    const right = root?.querySelector(".notes-v2__corner-cluster--right");
    return root?.dataset.interfaceActive === "false" && right && Number(getComputedStyle(right).opacity) < 0.05 && getComputedStyle(right).pointerEvents === "none";
  });
  evidence.footerAutoHideVerified = true;
  await wakeFooter(page);
  await page.locator(".notes-v2__terminal-host .xterm").first().evaluate(element => { window.__presentationSmokeFooterTerminal = element; });
  await runTerminalCommand(page, "test -t 0 && test -t 1 && printf 'AURIS_FOOTER_TTY_OK\\n'");
  await waitForTerminalText(page, "AURIS_FOOTER_TTY_OK");
  const originalSessionId = (await page.evaluate(() => window.shadowingDesktop.terminal.list()))[0].id;
  evidence.originalMinimumSize = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes("/notes"));
    const size = window.getMinimumSize();
    // This isolated stress test also covers widths below the shipped native minimum.
    window.setMinimumSize(760, 600);
    return size;
  });
  evidence.footerCases = [];
  for (const width of [1440, 1160, 1000, 900]) {
    await app.evaluate(({ BrowserWindow }, nextWidth) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(nextWidth, 900), width);
    await page.waitForFunction(nextWidth => document.documentElement.clientWidth === nextWidth, width);
    for (const expanded of [false, true]) {
      const currentExpanded = await page.locator(".desktop-app-sidebar").getAttribute("data-expanded");
      if (currentExpanded !== String(expanded)) await page.getByRole("button", { name: expanded ? "展开侧栏" : "收起侧栏", exact: true }).click();
      await page.waitForFunction(value => document.querySelector(".desktop-app-sidebar")?.dataset.expanded === String(value), expanded);
      await page.waitForFunction(value => {
        const width = document.querySelector(".desktop-app-sidebar")?.getBoundingClientRect().width;
        return value ? width >= 239 : width <= 31;
      }, expanded);
      await wakeFooter(page);
      const metrics = await footerMetrics(page);
      evidence.footerCases.push({ requestedWidth: width, belowNativeMinimum: width < evidence.originalMinimumSize[0], expanded, pane: "terminal", ...metrics });
      check(() => assertFooter(metrics, `${width}px sidebar ${expanded ? "expanded" : "collapsed"}`), `${width}px sidebar ${expanded}`);
      if (diagnostic && !metrics.buttons.find(button => button.name === "打开终端面板")?.hit) continue;
      await clickFooterButton(page, "打开终端面板");
      await page.waitForFunction(() => document.querySelector(".notes-v2")?.dataset.terminalOpen === "false");
      await clickFooterButton(page, "打开终端面板");
      await page.waitForFunction(() => document.querySelector(".notes-v2")?.dataset.terminalOpen === "true");
      await waitForTerminalText(page, "AURIS_FOOTER_TTY_OK");
      assert(await page.evaluate(() => window.__presentationSmokeFooterTerminal === document.querySelector(".notes-v2__terminal-host .xterm")), "Footer toggle must preserve the existing xterm DOM instance");
      assert.equal((await page.evaluate(() => window.shadowingDesktop.terminal.list()))[0].id, originalSessionId, "Footer toggle must preserve the existing PTY session");
    }
  }
  await verifySyntheticSaveLabel(page, width => app.evaluate(({ BrowserWindow }, nextWidth) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(nextWidth, 900), width), evidence, check);
  await wakeFooter(page);
  evidence.footerLastLine = await page.locator(".ProseMirror p").filter({ hasText: "AURIS_FOOTER_LAST_LINE" }).evaluate(async paragraph => {
    const scrollers = [];
    for (let element = paragraph.parentElement; element; element = element.parentElement) {
      if (["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
        element.scrollTop = element.scrollHeight;
        scrollers.push({ className: element.className, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight });
      }
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = paragraph.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, footerTop: document.querySelector(".notes-v2__status-footer").getBoundingClientRect().top, scrollers };
  });
  check(() => assert(evidence.footerLastLine.scrollers.length > 0, "Long fixture must exercise actual document scrolling"), "last-line scrolling");
  check(() => assert(evidence.footerLastLine.top >= 0 && evidence.footerLastLine.bottom <= evidence.footerLastLine.footerTop + 1, "Last document line must remain visible above the footer after scrolling to the end"), "last-line occlusion");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(1440, 900));
  await clickFooterButton(page, "学习依赖待复核");
  await page.locator("#notes-v2-dependency-review-popover-title").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator("#notes-v2-dependency-review-popover-title").waitFor({ state: "hidden" });
  evidence.footerReviewPopoverReachable = true;
  await clickFooterButton(page, "打开内置浏览器");
  await page.waitForFunction(() => document.querySelector(".notes-v2")?.dataset.browserPaneOpen === "true");
  await wakeFooter(page);
  const browserMetrics = await footerMetrics(page);
  evidence.footerCases.push({ requestedWidth: 1440, expanded: true, pane: "browser", ...browserMetrics });
  check(() => assertFooter(browserMetrics, "embedded browser with expanded sidebar"), "embedded browser with expanded sidebar");
  await clickFooterButton(page, "打开终端面板");
  await page.waitForFunction(() => document.querySelector(".notes-v2")?.dataset.terminalOpen === "true");
  await runTerminalCommand(page, "printf 'AURIS_FOOTER_REOPEN_INPUT_OK\\n'");
  await waitForTerminalText(page, "AURIS_FOOTER_REOPEN_INPUT_OK");
  evidence.footerTogglePreservedPtyAndXterm = true;
}

function waitUntilStopped() {
  return new Promise(resolve => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

function saveEvidence(temporaryRoot, evidence) {
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  fs.writeFileSync(path.join(temporaryRoot, "evidence.json"), json);
  const outputPath = argument("--evidence-json");
  if (outputPath) fs.writeFileSync(path.resolve(outputPath), json);
}

async function main() {
  const appPath = argument("--app");
  const devUrl = argument("--dev-url");
  assert(appPath || devUrl, "Pass --app /path/to/Auris.app or --dev-url http://127.0.0.1:port");
  const baseline = process.argv.includes("--baseline");
  const footerOnly = process.argv.includes("--footer-only");
  const footerCssProbePath = argument("--footer-css-probe");
  assert(!footerCssProbePath || footerOnly, "CSS injection is only allowed in an explicitly marked footer diagnostic run");
  const keep = process.argv.includes("--keep");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auris-vmark-presentation-"));
  const vaultRoot = path.join(temporaryRoot, "vault");
  fs.mkdirSync(vaultRoot);
  const fixturePath = argument("--fixture") || path.join(vaultRoot, "展示对照.md");
  if (!argument("--fixture")) fs.writeFileSync(fixturePath, footerOnly ? FOOTER_REVIEW_FRONTMATTER + FIXTURE.replace("Notes 展示对照", LONG_TITLE) + FOOTER_SCROLL_BODY : FIXTURE);
  const originalSource = fs.readFileSync(fixturePath, "utf8");
  const suppliedUserData = argument("--user-data-dir");
  const userData = suppliedUserData ? path.resolve(suppliedUserData) : path.join(temporaryRoot, "user-data");
  if (suppliedUserData) {
    assert([os.tmpdir(), "/tmp", "/private/tmp"].some(root => userData.startsWith(`${path.resolve(root)}${path.sep}`)), "Only a temporary profile may be reused by this smoke test");
  }
  const useInternalVault = !baseline && !footerOnly && !argument("--fixture") && !suppliedUserData;
  if (useInternalVault) {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, "shadowing-desktop-config.json"), `${JSON.stringify({ vaultPath: vaultRoot, knownVaultRoots: [vaultRoot], pluginsEnabled: {}, mcp: { autoApproveEdits: false, enabled: false, startOnLaunch: false } }, null, 2)}\n`);
  }
  const env = {
    ...process.env,
    AURIS_PACKAGED_SMOKE: "1",
    AURIS_PACKAGED_SMOKE_USER_DATA: userData,
    SHELL: "/bin/sh",
    HISTFILE: path.join(temporaryRoot, "shell-history"),
    ZDOTDIR: path.join(temporaryRoot, "shell-config"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SHADOWING_DESKTOP_URL;
  if (devUrl) env.SHADOWING_DESKTOP_URL = devUrl;
  let app;
  const evidence = { mode: baseline ? "baseline" : footerCssProbePath ? "footer-diagnostic" : footerOnly ? "footer-regression" : "regression", temporaryRoot, fixturePath, userData, isolatedUserData: true, rendererMessages: [] };
  try {
    app = await _electron.launch({
      ...(appPath ? { executablePath: path.join(path.resolve(appPath), "Contents/MacOS/Auris") } : {}),
      args: appPath ? [fixturePath] : [path.resolve(__dirname, "../../electron/main.cjs"), "--dev", fixturePath],
      env,
      timeout: 60_000,
    });
    const observedPages = new Set();
    const observePage = page => {
      if (observedPages.has(page)) return;
      observedPages.add(page);
      page.on("pageerror", error => evidence.rendererMessages.push({ type: "pageerror", text: error.message }));
      page.on("console", message => {
        if (["error", "warning"].includes(message.type())) evidence.rendererMessages.push({ type: message.type(), text: message.text() });
      });
    };
    app.on("window", observePage);
    app.windows().forEach(observePage);
    const page = await waitForNotesWindow(app);
    page.setDefaultTimeout(15_000);
    await page.locator(".ProseMirror table").first().waitFor({ state: "visible", timeout: 90_000 });
    if (footerCssProbePath) {
      const sourcePath = path.resolve(footerCssProbePath);
      const css = fs.readFileSync(sourcePath, "utf8");
      const start = css.indexOf("/* The editor footer");
      assert(start >= 0, "Diagnostic CSS source must contain the footer section marker");
      const footerCss = css.slice(start);
      fs.writeFileSync(path.join(temporaryRoot, "injected-footer.css"), footerCss);
      evidence.injectedFooterCss = { source: sourcePath, sha256: createHash("sha256").update(footerCss).digest("hex"), diagnosticOnly: true };
      await page.addStyleTag({ content: footerCss });
    }
    if (useInternalVault) {
      await page.waitForFunction(async () => Boolean((await window.shadowingDesktop.vault.getDirectoryInfo()).vaultPath));
      await page.getByRole("button", { name: `返回 ${path.basename(vaultRoot)}`, exact: true }).click();
      await page.locator(".notes-v2--folder-browser").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "列表视图", exact: true }).click();
      // OS-opened and vault-relative paths can appear as separate entries for the same
      // file. The temporary vault root entry has no directory subtitle; explicitly
      // choose it so preview validation exercises an internal workspace document.
      await page.getByRole("button", { name: "打开笔记 Notes 展示对照", exact: true }).filter({ hasNot: page.locator("small") }).click();
      await page.locator(".ProseMirror table").first().waitFor({ state: "visible" });
      evidence.openedViaInternalVault = true;
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(1440, 900));
    await page.waitForTimeout(300);
    evidence.pid = app.process().pid;
    evidence.url = page.url();
    evidence.rich = await tableMetrics(page, ".ProseMirror table");
    evidence.typography = await page.locator(".ProseMirror p").first().evaluate(element => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontFamily: style.fontFamily, lineHeight: style.lineHeight };
    });
    await toggleTerminal(page);
    await page.locator(".xterm-helper-textarea").first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(async () => (await window.shadowingDesktop.terminal.list()).some(session => session.backend), null, { timeout: 30_000 });
    await waitForTerminalFit(page);
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".xterm-rows")).some(element => getComputedStyle(element).display !== "none" && element.textContent.trim().length > 0));
    evidence.terminalSessions = await page.evaluate(() => window.shadowingDesktop.terminal.list());
    evidence.terminalGeometry = await terminalGeometry(page);
    evidence.terminalRenderedText = await page.locator(".xterm-rows:visible").first().textContent();
    await page.screenshot({ path: path.join(temporaryRoot, "notes-terminal.png"), fullPage: true });

    if (footerOnly) {
      await verifyFooterBoundary(app, page, evidence, Boolean(footerCssProbePath));
      await page.screenshot({ path: path.join(temporaryRoot, "footer-presentation.png"), fullPage: true });
    }

    if (!baseline && !footerOnly) {
      assert.equal(evidence.rich.tableLayout, "auto", "Rich table should use content-aware automatic layout");
      assert(evidence.rich.columns[1] > evidence.rich.columns[0] * 2, "Long description needs more space than a short label");
      assert(evidence.rich.columns[1] > evidence.rich.columns[2] * 2, "Long description needs more space than the short status");
      assert(evidence.rich.wrappers.some(wrapper => ["auto", "scroll"].includes(wrapper.overflowX)), "Table overflow must be contained by a horizontal scroller");
      assert(evidence.rich.documentScrollWidth <= evidence.rich.documentWidth + 1, "Tables must not widen the desktop document");
      const session = evidence.terminalSessions[0];
      assert.equal(session.backend, "pty", "Real desktop terminal must have a PTY backend");
      await runTerminalCommand(page, "printf '\\033[32mAURIS_ANSI_OK\\033[0m\\n'; test -t 0 && test -t 1 && printf 'AURIS_TTY_OK\\n'; printf 'AURIS_GEOMETRY '; stty size");
      await page.waitForFunction(async () => (await window.shadowingDesktop.terminal.list()).some(current => current.output.includes("AURIS_TTY_OK\r\n")));
      await waitForTerminalText(page, "AURIS_ANSI_OK");
      evidence.terminalOutput = await page.evaluate(() => window.shadowingDesktop.terminal.list());
      assert(evidence.terminalOutput[0].output.includes("\u001b[32mAURIS_ANSI_OK\u001b[0m"), "ANSI stream must reach xterm without losing color escapes");
      evidence.ansiRendered = await page.locator(".xterm-rows:visible > div").evaluateAll(rows => rows.some(row => row.textContent.trim() === "AURIS_ANSI_OK" && Array.from(row.querySelectorAll("span")).some(span => getComputedStyle(span).color !== getComputedStyle(row).color)));
      assert(evidence.ansiRendered, "ANSI output must be visibly rendered with its color");
      await runTerminalCommand(page, "printf '\\033[?1049h\\033[2J\\033[HAURIS_ALT_BAD\\r\\033[2KAURIS_ALT_OK'");
      await waitForTerminalText(page, "AURIS_ALT_OK");
      evidence.alternateScreen = await page.locator(".xterm-rows:visible").first().textContent();
      assert(!evidence.alternateScreen.includes("AURIS_ALT_BAD"), "Cursor movement and erase-line must replace the earlier text");
      assert(!evidence.alternateScreen.includes("AURIS_TTY_OK"), "Alternate screen must replace the visible normal buffer");
      await page.locator(".notes-v2__terminal-host .xterm").first().evaluate(element => { window.__presentationSmokeTerminal = element; });
      await toggleTerminal(page);
      await page.waitForFunction(() => document.querySelector(".notes-v2").dataset.terminalOpen === "false");
      await toggleTerminal(page);
      await page.locator(".xterm-helper-textarea:visible").first().waitFor();
      await waitForTerminalText(page, "AURIS_ALT_OK");
      evidence.alternateScreenPreservedAfterReopen = true;
      evidence.sameXtermDuringAlternateScreen = await page.evaluate(() => window.__presentationSmokeTerminal === document.querySelector(".notes-v2__terminal-host .xterm"));
      assert(evidence.sameXtermDuringAlternateScreen, "The alternate screen must preserve its xterm instance while hidden");
      await runTerminalCommand(page, "printf '\\033[?1049l\\nAURIS_ALT_EXIT\\n'");
      await waitForTerminalText(page, "AURIS_ALT_EXIT");
      evidence.normalBufferRestored = (await page.locator(".xterm-rows:visible").first().textContent()).includes("AURIS_TTY_OK");
      assert(evidence.normalBufferRestored, "Leaving the alternate screen must restore the normal terminal buffer");
      assert(evidence.terminalGeometry.screenWidth <= evidence.terminalGeometry.hostWidth + 1, "Terminal columns must fit host width");
      assert(evidence.terminalGeometry.screenHeight <= evidence.terminalGeometry.hostHeight + 1, "Terminal rows must fit host height");
      assert(evidence.terminalGeometry.screenWidth >= evidence.terminalGeometry.hostWidth - 64, "Terminal columns must fill the available viewport after fit");
      assert(evidence.terminalGeometry.screenHeight >= evidence.terminalGeometry.hostHeight - 36, "Terminal rows must fill the available viewport after fit");
      await page.locator(".notes-v2__terminal-host .xterm").first().evaluate(element => { window.__presentationSmokeTerminal = element; });
      await toggleTerminal(page);
      await page.waitForFunction(() => document.querySelector(".notes-v2").dataset.terminalOpen === "false");
      await toggleTerminal(page);
      await page.locator(".xterm-helper-textarea:visible").first().waitFor();
      evidence.sameXtermAfterReopen = await page.evaluate(() => window.__presentationSmokeTerminal === document.querySelector(".notes-v2__terminal-host .xterm"));
      assert(evidence.sameXtermAfterReopen, "Hiding the pane must preserve the xterm instance");
      assert.equal((await page.evaluate(() => window.shadowingDesktop.terminal.list()))[0].id, session.id, "Hiding the pane must preserve the PTY session");
      await runTerminalCommand(page, "printf 'AURIS_REOPEN_INPUT_OK\\n'");
      await waitForTerminalText(page, "AURIS_REOPEN_INPUT_OK");
      await runTerminalCommand(page, "printf 'AURIS_CJK_OK 中文终端\\n'");
      await waitForTerminalText(page, "AURIS_CJK_OK 中文终端");
      evidence.inputAfterReopen = true;
      evidence.terminalCjkInputAndOutput = true;

      await page.getByRole("button", { name: "新会话", exact: true }).click();
      await page.waitForFunction(async () => (await window.shadowingDesktop.terminal.list()).length === 2);
      await page.waitForFunction(() => document.querySelector('.notes-v2__terminal-tab[aria-selected="true"]')?.getAttribute("data-status") === "running");
      await runTerminalCommand(page, "printf 'AURIS_SECOND_SESSION_OK\\n'");
      await waitForTerminalText(page, "AURIS_SECOND_SESSION_OK");
      await page.getByRole("tab", { name: "Terminal 1", exact: true }).click();
      await waitForTerminalText(page, "AURIS_REOPEN_INPUT_OK");
      evidence.firstSessionPreserved = await page.locator(".xterm-rows:visible").first().textContent();
      assert(!evidence.firstSessionPreserved.includes("AURIS_SECOND_SESSION_OK"), "Each terminal session must retain its own screen buffer");
      await page.getByRole("tab", { name: "Terminal 2", exact: true }).click();
      await waitForTerminalText(page, "AURIS_SECOND_SESSION_OK");
      evidence.sessionSwitchPreservesBuffers = true;
      await page.getByRole("tab", { name: "Terminal 1", exact: true }).click();

      evidence.themes = [];
      for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
        await setTheme(page, theme);
        const geometry = await terminalGeometry(page);
        const themedTable = await tableMetrics(page, ".ProseMirror table");
        assert.equal(themedTable.tableLayout, "auto", `${theme}: table layout must remain content-aware`);
        assert(themedTable.documentScrollWidth <= themedTable.documentWidth + 1, `${theme}: table must not widen the document`);
        const paneBackground = await page.locator(".notes-v2__terminal-host .xterm:visible").evaluate(element => getComputedStyle(element).backgroundColor);
        evidence.themes.push({ theme, geometry, paneBackground });
      }
      assert.notEqual(evidence.themes[0].geometry.background, evidence.themes[4].geometry.background, "Terminal viewport must follow the application theme");
      await setTheme(page, "white");
      await toggleTerminal(page);

      const originalTypography = await page.evaluate(() => JSON.parse(localStorage.getItem("auris.notes.typography") || "null"));
      const typography = {
        fontSize: "24px", lineHeight: "2.0", blockSpacing: "21px", cjkLetterSpacing: "normal", editorMaxWidth: "40em",
        fontLatin: '"Georgia"', fontCjk: '"Songti SC", SimSun', fontMono: '"Menlo", monospace',
      };
      await page.evaluate(value => {
        localStorage.setItem("auris.notes.typography", JSON.stringify(value));
        window.dispatchEvent(new CustomEvent("auris:notes-typography", { detail: value }));
      }, typography);
      await page.waitForTimeout(100);
      evidence.customTypography = await page.locator(".ProseMirror p").first().evaluate(element => {
        const style = getComputedStyle(element);
        const editor = element.closest(".notes-v2__editor-host--wysiwyg");
        const editorStyle = getComputedStyle(editor);
        return { fontSize: style.fontSize, lineHeight: style.lineHeight, fontFamily: style.fontFamily, maxWidth: editorStyle.maxWidth, width: editor.getBoundingClientRect().width };
      });
      assert.equal(evidence.customTypography.fontSize, "24px", "Actual rich paragraph must use the selected 24px font size");
      assert.equal(evidence.customTypography.lineHeight, "48px", "Actual rich paragraph must use the selected 2.0 line height");
      assert(evidence.customTypography.fontFamily.includes("Georgia") && evidence.customTypography.fontFamily.includes("Songti SC"), "Actual rich text must use the selected font stack");
      assert.equal(evidence.customTypography.maxWidth, "960px", "Actual rich text column must consume 40em at 24px");
      const monospace = await page.locator(".ProseMirror code").first().evaluate(element => getComputedStyle(element).fontFamily);
      assert(monospace.includes("Menlo"), "Inline code must use the selected monospace font");

      await page.getByRole("button", { name: "Markdown 与微信公众号预览分屏", exact: true }).click();
      await page.locator(".notes-v2__markdown-split-preview table").first().waitFor({ state: "visible" });
      evidence.splitPreview = await tableMetrics(page, ".notes-v2__markdown-split-preview table");
      assert(evidence.splitPreview.documentScrollWidth <= evidence.splitPreview.documentWidth + 1, "Wechat split preview must remain contained in the desktop layout");
      evidence.sourceFont = await page.locator(".cm-content").first().evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, fontFamily: getComputedStyle(element).fontFamily }));
      assert(evidence.sourceFont.fontFamily.includes("Menlo"), "Actual source editor must consume the selected monospace font");
      await page.getByRole("button", { name: "Markdown 与微信公众号预览分屏", exact: true }).click();
      await page.locator(".ProseMirror").waitFor({ state: "visible" });
      await page.evaluate(value => {
        if (value) localStorage.setItem("auris.notes.typography", JSON.stringify(value));
        else localStorage.removeItem("auris.notes.typography");
        window.dispatchEvent(new Event("storage"));
      }, originalTypography);
      const wideFixturePath = path.join(vaultRoot, "长中文表格边界.md");
      const headers = Array.from({ length: 12 }, (_, index) => `对照列${index + 1}`);
      const cells = headers.map((_, index) => `中文边界说明${index + 1}：这段内容应由表格自身横向滚动，不应撑大整个应用。`);
      fs.writeFileSync(wideFixturePath, `# 长中文表格边界\n\n| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n| ${cells.join(" | ")} |\n`);
      await app.evaluate(({ app: electronApp }, filePath) => electronApp.emit("open-file", { preventDefault() {} }, filePath), wideFixturePath);
      await page.waitForFunction(() => document.querySelector(".ProseMirror table")?.textContent.includes("对照列12"));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(900, 760));
      await page.waitForTimeout(100);
      evidence.wideChineseTable = await tableMetrics(page, ".ProseMirror table");
      assert(evidence.wideChineseTable.documentScrollWidth <= evidence.wideChineseTable.documentWidth + 1, "Long Chinese table must not widen the application body");
      assert(evidence.wideChineseTable.wrappers.some(wrapper => ["auto", "scroll"].includes(wrapper.overflowX) && wrapper.scrollWidth > wrapper.width + 1), "Long Chinese table must overflow within its own horizontal scroller");
      evidence.wideTableScrolls = await page.locator(".notes-v2__table-scroll-wrapper").first().evaluate(wrapper => {
        wrapper.scrollLeft = 120;
        return wrapper.scrollLeft > 0;
      });
      assert(evidence.wideTableScrolls, "The long table's horizontal scrollbar must actually move");
      await app.evaluate(({ app: electronApp }, filePath) => electronApp.emit("open-file", { preventDefault() {} }, filePath), fixturePath);
      await page.waitForFunction(() => document.querySelector(".ProseMirror table")?.textContent.includes("说明与下一步"));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/notes")).setSize(1440, 900));
      await toggleTerminal(page);
    }

    assert.equal(fs.readFileSync(fixturePath, "utf8"), originalSource, "Presentation checks must not modify the note");
    saveEvidence(temporaryRoot, evidence);
    console.log(JSON.stringify(footerOnly ? {
      mode: evidence.mode, temporaryRoot, pid: evidence.pid, url: evidence.url,
      footerAutoHideVerified: evidence.footerAutoHideVerified,
      footerTogglePreservedPtyAndXterm: evidence.footerTogglePreservedPtyAndXterm,
      originalMinimumSize: evidence.originalMinimumSize,
      diagnosticErrors: evidence.diagnosticErrors,
      footerCases: evidence.footerCases.map(result => ({ width: result.viewportWidth, belowNativeMinimum: result.belowNativeMinimum ?? false, expanded: result.expanded, pane: result.pane, footerHeight: result.footer.height, editorPaddingBottom: result.editorPaddingBottom, left: result.left, right: result.right, titleWidth: result.title.clientWidth, hitTargets: result.buttons.length })),
    } : evidence, null, 2));
    if (keep) {
      console.log(`AURIS_PRESENTATION_WINDOW_READY pid=${evidence.pid} profile=${env.AURIS_PACKAGED_SMOKE_USER_DATA}`);
      await waitUntilStopped();
    }
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    if (app) {
      const page = app.windows().find(window => window.url().includes("/notes"));
      if (page) {
        evidence.failureState = await page.evaluate(async () => ({
          terminalHosts: Array.from(document.querySelectorAll(".notes-v2__terminal-host"), element => ({ children: element.children.length, text: element.querySelector(".xterm-rows")?.textContent?.slice(0,1500), display: getComputedStyle(element).display })),
          xtermDisplays: Array.from(document.querySelectorAll(".notes-v2__terminal-xterm"), element => ({ display: getComputedStyle(element).display, text: element.querySelector(".xterm-rows")?.textContent?.slice(0,1500) })),
          sessions: await window.shadowingDesktop.terminal.list(),
        })).catch(() => null);
        await page.screenshot({ path: path.join(temporaryRoot, "failure.png") }).catch(() => undefined);
      }
    }
    saveEvidence(temporaryRoot, evidence);
    console.error(JSON.stringify(evidence, null, 2));
    if (keep && app) {
      console.log(`AURIS_PRESENTATION_FAILURE_WINDOW_READY pid=${app.process().pid} profile=${env.AURIS_PACKAGED_SMOKE_USER_DATA}`);
      await waitUntilStopped();
    }
    throw error;
  } finally {
    if (app) await app.close();
    if (!keep) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

module.exports = { assertFooter, footerMetrics, verifySyntheticSaveLabel };

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
