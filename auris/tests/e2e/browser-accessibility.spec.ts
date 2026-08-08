import { expect, test } from "@playwright/test";

import { installBrowserTestBridges } from "./browser-bridge";

test.beforeEach(async ({ page }) => {
  await installBrowserTestBridges(page);
  await page.goto("/browser");
  await expect(page.getByRole("status")).toContainText("页面已就绪");
});

test("browser chrome, approvals, Nia, and workflows have keyboard-reachable names", async ({
  page,
}) => {
  const approval = page.getByRole("dialog", { name: "浏览器操作确认" });
  await expect(approval).toBeVisible();
  await expect(page.getByRole("button", { name: "拒绝" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "仅允许这一次" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(approval).toBeHidden();

  await expect(
    page.getByRole("toolbar", { name: "浏览器工具栏" }),
  ).toBeVisible();
  await expect(page.getByRole("search").getByLabel("地址或搜索")).toHaveValue(
    "https://example.com/research",
  );
  await expect(
    page.getByRole("tablist", { name: "浏览器标签页" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Nia assistant" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nia prompt")).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Workflow recorder" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Workflow library" }),
  ).toBeVisible();

  const firstTab = page.getByRole("tab", { name: "Research notes" });
  await firstTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Crashed tab" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "页面已崩溃，请手动刷新",
  );
});

test("critical controls remain visible and named at a reduced window size", async ({
  page,
}) => {
  await page.keyboard.press("Escape");
  await page.setViewportSize({ height: 720, width: 640 });
  await expect(page.getByLabel("地址或搜索")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建标签页" })).toBeVisible();
  await expect(page.getByLabel("新建标签模式")).toBeVisible();
  const toolbar = await page
    .getByRole("toolbar", { name: "浏览器工具栏" })
    .boundingBox();
  expect(toolbar).not.toBeNull();
  expect(toolbar!.x).toBeGreaterThanOrEqual(0);
  expect(toolbar!.width).toBeLessThanOrEqual(640);
});
