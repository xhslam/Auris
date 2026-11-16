import { expect, test } from "@playwright/test";
import {
  EMPTY_OUTPUT_REVIEW_STATE, createKnowledgePoint, createProject, toLocalDateKey,
} from "../../src/features/output-review/output-review-model";

test("Review is the homepage with one first, active rail entry", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("complementary", { name: "App navigation" });
  const review = rail.getByRole("button", { name: "每日回顾" });
  await expect(review).toHaveAttribute("aria-expanded", "false");
  await expect(rail.locator(".desktop-app-sidebar__link").first()).toHaveAttribute("aria-label", "每日回顾");
  await expect(rail.locator('.desktop-app-sidebar__link[data-active="true"]')).toHaveCount(1);
  await expect(rail.getByRole("link", { name: "首页", exact: true })).toHaveCount(0);
  await expect(page.locator(".auris-demo-home, .home-v3")).toHaveCount(0);
  await review.click();
  await expect(rail.getByRole("group", { name: "复习导航" }).getByRole("button")).toHaveCount(6);
  await expect(page).toHaveURL(/\/$/);
});

test("legacy Review point links preserve data and open its detail on the homepage", async ({ page }) => {
  const today = toLocalDateKey(new Date());
  let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "首页迁移测试" });
  state = createKnowledgePoint(state, {
    title: "已有知识点", projectId: state.projects[0].id, startDate: today,
  });
  await page.addInitScript((stored) => {
    localStorage.setItem("auris.output-review.v1", JSON.stringify(stored));
  }, state);
  await page.goto(`/review?knowledgePointId=${encodeURIComponent(state.knowledgePoints[0].id)}`);
  await expect(page).toHaveURL(/\/\?knowledgePointId=/);
  await expect(page.getByRole("complementary", { name: "知识点详情：已有知识点" })).toBeVisible();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "完成输出", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("auris.output-review.v1")!));
  expect(saved.knowledgePoints[0].id).toBe(state.knowledgePoints[0].id);
  expect(saved.knowledgePoints[0].currentStage).toBe("day2");
  expect(saved.cycles[0].events[0].status).toBe("completed");
});

test("legacy create links open the existing project-first flow on the homepage", async ({ page }) => {
  await page.goto("/review?intent=create-knowledge-point");
  await expect(page).toHaveURL(/\/\?intent=create-knowledge-point$/);
  await expect(page.getByRole("form", { name: "新建项目" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新建学习项目" })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`Review views meet the rail at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(window, "shadowingDesktop", { value: {} });
    });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "每日回顾" });
    const navigation = page.getByRole("group", { name: "复习导航" });
    await toggle.click();
    const icons = await navigation.getByRole("button").evaluateAll(buttons => buttons.map(button => {
      const { x, y } = button.getBoundingClientRect();
      return { x, y };
    }));
    expect(new Set(icons.map(icon => icon.x)).size).toBe(1);
    expect(icons.every((icon, index) => !index || icon.y > icons[index - 1].y)).toBe(true);
    const surface = page.locator(".review-workspace__surface");
    const readSeam = () => surface.evaluate(element => {
      const sidebar = document.querySelector(".desktop-app-sidebar")!;
      return element.getBoundingClientRect().left - sidebar.getBoundingClientRect().right;
    });
    for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
      await page.evaluate((value) => {
        localStorage.setItem("auris.notes.reading-theme", value);
        window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value }));
      }, theme);
      await expect(page.locator(".desktop-app-shell")).toHaveAttribute("data-app-theme", theme);
      for (const label of ["今日复习", "复习计划", "知识点目录", "全部条目", "复习统计"]) {
        const icon = navigation.getByRole("button", { name: label, exact: true });
        await icon.click();
        await expect(icon).toHaveAttribute("aria-current", "page");
        await expect.poll(readSeam).toBe(0);
      }
    }
    await navigation.getByRole("button", { name: "复习日历" }).click();
    await expect(page.getByRole("dialog", { name: "复习日历" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "复习日历" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "复习统计" })).toBeVisible();
    await toggle.click();
    await expect(navigation).toBeHidden();
    await expect.poll(readSeam).toBe(0);
  });
}
