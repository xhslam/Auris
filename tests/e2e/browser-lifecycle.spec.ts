import { expect, test } from "@playwright/test";

import { installBrowserTestBridges } from "./browser-bridge";

test.beforeEach(async ({ page }) => {
  await installBrowserTestBridges(page);
  await page.goto("/browser");
  await expect(page.getByRole("status")).toContainText("页面已就绪");
  await page.keyboard.press("Escape");
});

test("close, navigation, bookmark, and workflow cancellation settle visible state", async ({
  page,
}) => {
  const bookmark = page.getByRole("button", { name: "取消收藏当前页面" });
  await expect(bookmark).toHaveAttribute("aria-pressed", "true");
  await bookmark.click();
  await expect(
    page.getByRole("button", { name: "收藏当前页面" }),
  ).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("地址或搜索").fill("https://example.org/next");
  await page.getByLabel("地址或搜索").press("Enter");
  await expect(page.getByLabel("地址或搜索")).toHaveValue(
    "https://example.org/next",
  );

  await page
    .getByLabel("Workflow source")
    .fill(
      "name: local\nnia: v1\nsteps:\n  - id: one\n    uses: nia/template\n    with: { template: ok }\n",
    );
  await page.getByRole("button", { name: "Start · 开始" }).click();
  await expect(
    page.getByRole("region", { name: "Workflow run" }),
  ).toContainText("running");
  await page.getByRole("button", { name: "Cancel workflow" }).click();
  await expect(
    page.getByRole("region", { name: "Workflow run" }),
  ).toContainText("cancelled");

  await page.getByRole("button", { name: "关闭 Crashed tab" }).click();
  await expect(page.getByRole("tab", { name: "Crashed tab" })).toHaveCount(0);
});

test("restart projection retains only Human tabs and drops transient authority UI", async ({
  page,
}) => {
  await page.getByLabel("新建标签模式").selectOption("AiSandbox");
  await expect(page.getByRole("tab", { name: "New tab" })).toBeVisible();

  await page.evaluate(() => {
    (
      window as Window & {
        __browserE2E?: { restart(): void };
      }
    ).__browserE2E?.restart();
  });
  await page.reload();

  await expect(page.getByRole("tab", { name: "Research notes" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "浏览器操作确认" }),
  ).toHaveCount(0);
  await expect(page.locator(".browser-status-pill")).toHaveText("人工浏览");
});
