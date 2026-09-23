import { expect, test } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await installLocalNotesBridge(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("keeps both notes bottom toolbars close to the viewport edge", async ({ page }) => {
  await page.goto("/notes?resumeNoteId=pronunciation-sprint", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".notes-v2--minimal")).toBeVisible();

  const offsets = await page.evaluate(() => {
    const shell = document.querySelector(".notes-v2--minimal");

    if (!(shell instanceof HTMLElement)) {
      throw new Error("Missing minimal notes shell");
    }

    const clusters = [
      ".notes-v2__corner-cluster--left",
      ".notes-v2__corner-cluster--right",
    ].map((selector) => {
      const element = document.querySelector(selector);

      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing bottom toolbar: ${selector}`);
      }

      const rect = element.getBoundingClientRect();

      return {
        bottom: Number.parseFloat(window.getComputedStyle(element).bottom),
        height: rect.height,
        viewportGap: window.innerHeight - rect.bottom,
      };
    });

    const iconButtons = Array.from(
      document.querySelectorAll(".notes-v2__corner-cluster .notes-v2__corner-icon"),
    ).map((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error("Missing bottom icon button");
      }

      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });

    return {
      afterContent: window.getComputedStyle(shell, "::after").content,
      iconButtons,
      left: clusters[0],
      right: clusters[1],
    };
  });

  expect(offsets.afterContent).toBe("none");
  expect(offsets.left.bottom).toBe(0);
  expect(offsets.right.bottom).toBe(0);
  expect(offsets.left.height).toBe(40);
  expect(offsets.right.height).toBe(40);
  expect(offsets.left.viewportGap).toBe(0);
  expect(offsets.right.viewportGap).toBe(0);
  expect(offsets.iconButtons).not.toHaveLength(0);
  expect(
    offsets.iconButtons.every(({ height, width }) => height === 24 && width === 24),
  ).toBe(true);
});

test("keeps the terminal split clear of the left desktop rail", async ({ page }) => {
  await page.goto("/notes?resumeNoteId=pronunciation-sprint", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".notes-v2--minimal")).toBeVisible();

  await page.getByRole("button", { name: "打开终端面板" }).click();
  await expect(page.locator(".notes-v2__minimal-terminal-pane")).toBeVisible();

  const overlap = await page.evaluate(() => {
    const noteCluster = document.querySelector(".notes-v2__corner-cluster--left");
    const terminalPane = document.querySelector(".notes-v2__minimal-terminal-pane");

    if (!(noteCluster instanceof HTMLElement) || !(terminalPane instanceof HTMLElement)) {
      throw new Error("Missing note cluster or terminal pane");
    }

    const noteRect = noteCluster.getBoundingClientRect();
    const terminalRect = terminalPane.getBoundingClientRect();

    return noteRect.right > terminalRect.left && noteRect.left < terminalRect.right;
  });

  expect(overlap).toBe(false);

  const paddingLeft = await page
    .locator(".notes-v2__minimal-canvas")
    .evaluate((element) => Number.parseFloat(window.getComputedStyle(element).paddingLeft));

  expect(paddingLeft).toBe(24);

  const terminalPanePaddingBottom = await page
    .locator(".notes-v2__minimal-terminal-pane")
    .evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingBottom),
    );

  expect(terminalPanePaddingBottom).toBe(0);

  const terminalChrome = await page.evaluate(() => {
    const shell = document.querySelector(".notes-v2--minimal");
    const terminalPane = document.querySelector(".notes-v2__minimal-terminal-pane");
    const terminalSurface = document.querySelector(".notes-v2__terminal-surface");

    if (
      !(shell instanceof HTMLElement) ||
      !(terminalPane instanceof HTMLElement) ||
      !(terminalSurface instanceof HTMLElement)
    ) {
      throw new Error("Missing terminal chrome");
    }

    return {
      paneBackground: window.getComputedStyle(terminalPane).backgroundColor,
      shellBackground: window.getComputedStyle(shell).backgroundColor,
      surfaceBackground: window.getComputedStyle(terminalSurface).backgroundColor,
    };
  });

  expect(terminalChrome.paneBackground).toBe(terminalChrome.shellBackground);
  expect(terminalChrome.surfaceBackground).toBe("rgba(0, 0, 0, 0)");
});

test("renders the workspace file tree with Obsidian-style chrome", async ({ page }) => {
  await page.goto("/notes?resumeNoteId=pronunciation-sprint", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".notes-v2--minimal")).toBeVisible();

  await page.getByRole("button", { name: /Open workspace switcher/ }).click();

  const tree = page.locator('.notes-v2__file-tree[data-variant="obsidian"]');
  await expect(tree).toBeVisible();
  await expect(page.locator(".notes-v2__popover-header")).toHaveCount(0);
  await expect(tree).not.toContainText(".md");

  const treeStyle = await tree.evaluate((element) => {
    function resolveColor(scope: HTMLElement, value: string) {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.pointerEvents = "none";
      probe.style.backgroundColor = value;
      scope.appendChild(probe);
      const resolved = window.getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    }

    const style = window.getComputedStyle(element);
    const shell = element.closest(".notes-v2");

    if (!(shell instanceof HTMLElement)) {
      throw new Error("Missing notes shell");
    }

    const shellStyle = window.getComputedStyle(shell);

    return {
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
      themeBackgroundColor: resolveColor(
        shell,
        shellStyle.getPropertyValue("--notes-obsidian-tree-bg").trim(),
      ),
    };
  });

  expect(treeStyle.backgroundColor).toBe(treeStyle.themeBackgroundColor);
  expect(treeStyle.fontSize).toBe("16px");
});

test("keeps the workspace file tree synced with dark notes theme", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("auris.notes.reading-theme", "night");
  });
  await page.goto("/notes?resumeNoteId=pronunciation-sprint", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.notes-v2--minimal[data-notes-theme="night"]')).toBeVisible();

  await page.getByRole("button", { name: /Open workspace switcher/ }).click();

  const tree = page.locator('.notes-v2__file-tree[data-variant="obsidian"]');
  await expect(tree).toBeVisible();

  const colors = await tree.evaluate((element) => {
    function resolveColor(scope: HTMLElement, property: "backgroundColor" | "color", value: string) {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.pointerEvents = "none";
      probe.style[property] = value;
      scope.appendChild(probe);
      const resolved = window.getComputedStyle(probe)[property];
      probe.remove();
      return resolved;
    }

    const shell = element.closest(".notes-v2");

    if (!(shell instanceof HTMLElement)) {
      throw new Error("Missing notes shell");
    }

    const style = window.getComputedStyle(element);
    const shellStyle = window.getComputedStyle(shell);

    return {
      backgroundColor: style.backgroundColor,
      textColor: style.color,
      themeBackgroundColor: resolveColor(
        shell,
        "backgroundColor",
        shellStyle.getPropertyValue("--notes-obsidian-tree-bg").trim(),
      ),
      themeTextColor: resolveColor(
        shell,
        "color",
        shellStyle.getPropertyValue("--notes-obsidian-tree-text").trim(),
      ),
    };
  });

  expect(colors.backgroundColor).toBe(colors.themeBackgroundColor);
  expect(colors.textColor).toBe(colors.themeTextColor);
  expect(colors.backgroundColor).not.toBe("rgb(247, 247, 246)");
});

test("creates a new note with a blank title placeholder", async ({ page }) => {
  const placeholder = "输入你想说的";
  await page.goto("/notes?resumeNoteId=pronunciation-sprint");
  await expect(
    page.locator('[data-testid="notes-prosemirror-host"], [data-testid="notes-codemirror-host"]').first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建" }).click();

  const createdPath = await page.waitForFunction((expectedPlaceholder) => {
    const harness = (
      window as Window & {
        __notesHarness?: {
          getFile: (relativePath: string) => string | null;
          listFiles: () => string[];
        };
      }
    ).__notesHarness;
    const path = harness
      ?.listFiles()
      .find((candidate) => /(?:^|\/)study-note-\d+\.md$/.test(candidate));

    return path && harness?.getFile(path) === `${expectedPlaceholder}\n`
      ? path
      : null;
  }, placeholder);
  const createdRelativePath = await createdPath.jsonValue();

  expect(typeof createdRelativePath).toBe("string");
  if (typeof createdRelativePath !== "string") {
    throw new Error("Expected the new note path to be captured.");
  }
  await expect(page.getByLabel("Note title")).toHaveValue("");
  await expect(
    page.locator('[data-testid="notes-prosemirror-host"], [data-testid="notes-codemirror-host"]').first(),
  ).toContainText(placeholder);
  await expect(
    page.locator('[data-testid="notes-prosemirror-host"], [data-testid="notes-codemirror-host"]').first(),
  ).not.toContainText("Study Note");

  const editableSurface = page
    .locator(
      '[data-testid="notes-prosemirror-host"] .ProseMirror, [data-testid="notes-codemirror-host"] .cm-content',
    )
    .first();
  await editableSurface.click();

  await expect
    .poll(() =>
      page.evaluate((path) => {
        return (
          window as Window & {
            __notesHarness?: { getFile: (relativePath: string) => string | null };
          }
        ).__notesHarness?.getFile(path) ?? null;
      }, createdRelativePath),
    )
    .toBe("");
});

test("collapses and re-expands the right sidebar", async ({ page }) => {
  await page.goto("/notes?resumeNoteId=pronunciation-sprint");

  await expect(page.getByRole("button", { name: "收起右侧栏" })).toBeVisible();
  await expect(page.getByRole("region", { name: "属性" })).toBeVisible();

  await page
    .getByRole("button", { name: "收起右侧栏" })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(page.getByRole("button", { name: "展开右侧栏" })).toBeVisible();
  await expect(page.getByRole("region", { name: "属性" })).toHaveCount(0);

  await page
    .getByRole("button", { name: "展开右侧栏" })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(page.getByRole("button", { name: "收起右侧栏" })).toBeVisible();
  await expect(page.getByRole("region", { name: "属性" })).toBeVisible();
});

test("deletes the active note from the workbench", async ({ page }) => {
  await page.goto("/notes?resumeNoteId=pronunciation-sprint");
  const deletedPath = await page
    .locator(".notes-v2__document-path")
    .textContent();

  await page.getByRole("button", { name: "快速删除当前笔记" }).click();
  const confirmDialog = page.getByRole("alertdialog");
  await expect(confirmDialog).toContainText("删除");
  await confirmDialog.getByRole("button", { name: "删除" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          (
            window as Window & {
              __notesHarness?: {
                listFiles: () => string[];
              };
            }
          ).__notesHarness?.listFiles() ?? []
        );
      }),
    )
    .not.toContain(deletedPath ?? "");

  const remainingFiles = await page.evaluate(() => {
    return (
      (
        window as Window & {
          __notesHarness?: {
            listFiles: () => string[];
          };
        }
      ).__notesHarness?.listFiles() ?? []
    );
  });

  expect(remainingFiles).toHaveLength(1);
  await expect
    .poll(() => page.locator(".notes-v2__document-path").textContent())
    .toBe(remainingFiles[0] ?? null);
});
