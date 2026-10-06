import { expect, test } from "@playwright/test";
import {
  EMPTY_OUTPUT_REVIEW_STATE, createKnowledgePoint, createProject, toLocalDateKey,
} from "../../src/features/output-review/output-review-model";

test("Review is the homepage with one first, active rail entry", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("complementary", { name: "App navigation" });
  const review = rail.getByRole("link", { name: "每日回顾" });
  await expect(page.getByRole("navigation", { name: "输出复习视图" })).toBeVisible();
  await expect(review).toHaveAttribute("href", "/");
  await expect(review).toHaveAttribute("data-active", "true");
  await expect(rail.locator('.desktop-app-sidebar__link').first()).toHaveAttribute("href", "/");
  await expect(rail.locator('.desktop-app-sidebar__link[data-active="true"]')).toHaveCount(1);
  await expect(rail.getByRole("link", { name: "首页", exact: true })).toHaveCount(0);
  await expect(page.locator(".auris-demo-home, .home-v3")).toHaveCount(0);
  await review.click();
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
  test(`Review shares the heatmap header at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    const navigation = page.getByRole("navigation", { name: "输出复习视图" });
    await expect(navigation.getByRole("button")).toHaveCount(4);
    await expect(navigation.getByRole("button", { name: "日历", exact: true })).toHaveCount(0);
    for (const theme of ["white", "paper", "mint", "sepia", "night", "solarized"]) {
      await page.evaluate((value) => {
        localStorage.setItem("auris.notes.reading-theme", value);
        window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: value }));
      }, theme);
      await expect(page.locator(".desktop-app-shell")).toHaveAttribute("data-app-theme", theme);
      await navigation.getByRole("button", { name: "复盘热力图", exact: true }).click();
      const header = page.locator(".output-review-navigation");
      const measure = () => header.evaluate((element) => {
        const bounds = (node: Element) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        const tabs = Array.from(element.querySelectorAll("nav button"));
        const firstStyle = getComputedStyle(tabs[0]);
        const add = element.querySelector(".output-review-add")!;
        const addStyle = getComputedStyle(add);
        return {
          header: bounds(element), tabs: tabs.map(bounds), add: bounds(add),
          font: firstStyle.font, addBackground: addStyle.backgroundColor,
          addRadius: addStyle.borderRadius, line: getComputedStyle(element).borderBottom,
          inset: getComputedStyle(element.parentElement!).paddingLeft,
        };
      });
      const heatmapHeader = await measure();
      expect(heatmapHeader.inset).toBe("64px");
      for (const label of ["今天", "全部", "项目", "复盘热力图"]) {
        await navigation.getByRole("button", { name: label, exact: true }).click();
        // Active font weight can change tab text width; positions of the header,
        // first tab and primary action must stay fixed across views.
        const current = await measure();
        expect(current.header).toEqual(heatmapHeader.header);
        expect(current.add).toEqual(heatmapHeader.add);
        expect(current.tabs[0].x).toBe(heatmapHeader.tabs[0].x);
        expect(current.tabs[0].y).toBe(heatmapHeader.tabs[0].y);
        expect(current.addBackground).toBe(heatmapHeader.addBackground);
        expect(current.addRadius).toBe(heatmapHeader.addRadius);
        expect(current.line).toBe(heatmapHeader.line);
        await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        const add = header.getByRole("button", { name: "添加知识点", exact: true });
        await add.click();
        await expect(page.getByRole("form", { name: "添加知识点" })).toBeVisible();
        await page.getByRole("button", { name: "取消", exact: true }).click();
      }
    }
  });
}
