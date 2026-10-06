import { expect, test } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await installLocalNotesBridge(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("keeps the app sidebar as a persistent home-style rail on notes", async ({
  page,
}) => {
  await page.goto("/notes");

  const shell = page.locator(".desktop-app-shell");
  const notesWorkbench = page.locator(".notes-v2");
  const viewport = page.locator(".desktop-app-frame__viewport");

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");
  await expect(shell).toHaveAttribute("data-sidebar-expanded", "false");
  await expect(notesWorkbench).toBeVisible();
  await expect(viewport).toBeVisible();

  const initialWorkbenchBox = await notesWorkbench.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });

  // Push layout: main content starts after the persistent rail.
  expect(initialWorkbenchBox.x).toBeGreaterThanOrEqual(54);
  expect(initialWorkbenchBox.x).toBeLessThanOrEqual(64);
  expect(initialWorkbenchBox.y).toBeLessThan(1);

  const initialViewportWidth = await viewport.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  const sidebar = page.locator(".desktop-app-sidebar");
  await expect(sidebar).toHaveAttribute("data-visible", "false");
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect(sidebar).toBeVisible();

  const revealedViewportWidth = await viewport.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  // Hover must not change layout width (expand is click-only).
  expect(Math.abs(revealedViewportWidth - initialViewportWidth)).toBeLessThan(
    1,
  );

  const sidebarBox = await sidebar.boundingBox();

  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox?.width ?? 0).toBeGreaterThanOrEqual(54);
  expect(sidebarBox?.width ?? 0).toBeLessThanOrEqual(58);
  expect(sidebarBox?.height ?? 0).toBeGreaterThanOrEqual(899);
  expect(sidebarBox?.height ?? 0).toBeLessThanOrEqual(900);

  await page.mouse.move(760, 280);

  await expect
    .poll(() => shell.getAttribute("data-sidebar-visible"))
    .toBe("false");
  await expect(shell).toHaveAttribute("data-sidebar-expanded", "false");
});

test("keeps the persistent sidebar fully inside the desktop viewport", async ({
  page,
}) => {
  await page.goto("/notes");

  const shell = page.locator(".desktop-app-shell");
  const sidebar = page.locator(".desktop-app-sidebar");

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");
  await expect(sidebar).toHaveAttribute("data-visible", "false");
  await expect(sidebar).toBeVisible();

  const metrics = await page.evaluate(() => {
    const sidebarElement = document.querySelector(".desktop-app-sidebar");

    if (!(sidebarElement instanceof HTMLElement)) {
      throw new Error("Desktop sidebar is missing");
    }

    const sidebarRect = sidebarElement.getBoundingClientRect();

    return {
      sidebarBottom: sidebarRect.bottom,
      sidebarTop: sidebarRect.top,
      viewportHeight: window.innerHeight,
    };
  });

  expect(metrics.sidebarTop).toBeLessThanOrEqual(84);
  expect(metrics.sidebarBottom).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("keeps the bottom navigation item visible on shorter desktop heights", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto("/notes");

  const shell = page.locator(".desktop-app-shell");
  const sidebar = page.locator(".desktop-app-sidebar");
  const lastNavItem = page.locator(".desktop-app-sidebar__link").last();

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");
  await expect(sidebar).toHaveAttribute("data-visible", "false");
  await expect(lastNavItem).toBeVisible();

  const metrics = await page.evaluate(() => {
    const sidebarElement = document.querySelector(".desktop-app-sidebar");
    const sectionsElement = document.querySelector(
      ".desktop-app-sidebar__sections",
    );

    if (
      !(sidebarElement instanceof HTMLElement) ||
      !(sectionsElement instanceof HTMLElement)
    ) {
      throw new Error("Desktop sidebar elements are missing");
    }

    const linkElements = Array.from(
      sidebarElement.querySelectorAll(".desktop-app-sidebar__link"),
    );
    const lastLinkElement = linkElements.at(-1);

    if (!(lastLinkElement instanceof HTMLElement)) {
      throw new Error("Desktop sidebar links are missing");
    }

    const sidebarRect = sidebarElement.getBoundingClientRect();
    const sectionsRect = sectionsElement.getBoundingClientRect();
    const lastLinkRect = lastLinkElement.getBoundingClientRect();

    return {
      lastLinkBottom: lastLinkRect.bottom,
      lastLinkTop: lastLinkRect.top,
      sidebarBottom: sidebarRect.bottom,
      sidebarTop: sidebarRect.top,
      sectionsBottom: sectionsRect.bottom,
      sectionsTop: sectionsRect.top,
      viewportHeight: window.innerHeight,
    };
  });

  expect(metrics.sidebarTop).toBeLessThanOrEqual(24);
  expect(metrics.lastLinkBottom).toBeLessThanOrEqual(metrics.sectionsBottom);
  expect(metrics.lastLinkBottom).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("shows the persistent app sidebar on the reading page", async ({
  page,
}) => {
  await page.goto("/reading");

  const shell = page.locator(".desktop-app-shell");
  const sidebar = page.locator(".desktop-app-sidebar");
  const reader = page.locator(".reading-library");

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");
  await expect(shell).toHaveAttribute("data-sidebar-expanded", "false");
  await expect(reader).toBeVisible();
  await expect(page.getByTestId("desktop-sidebar-reveal-zone")).toHaveCount(0);
  await expect(sidebar).toHaveAttribute("data-visible", "false");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('[href="/reading"]')).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await expect(reader.getByRole("button", { name: "导入" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "收藏" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "历史" })).toHaveCount(0);
});

test("pushes main content when the sidebar expands", async ({ page }) => {
  await page.goto("/reading");

  const shell = page.locator(".desktop-app-shell");
  const sidebar = page.locator(".desktop-app-sidebar");

  await expect(shell).toHaveAttribute("data-sidebar-expanded", "false");

  const collapsed = await page.evaluate(() => {
    const sidebarElement = document.querySelector(".desktop-app-sidebar");
    const viewportElement = document.querySelector(
      ".desktop-app-frame__viewport",
    );
    if (
      !(sidebarElement instanceof HTMLElement) ||
      !(viewportElement instanceof HTMLElement)
    ) {
      throw new Error("Sidebar layout elements are missing");
    }
    return {
      sidebarWidth: sidebarElement.getBoundingClientRect().width,
      viewportWidth: viewportElement.getBoundingClientRect().width,
    };
  });

  expect(collapsed.sidebarWidth).toBeGreaterThanOrEqual(54);
  expect(collapsed.sidebarWidth).toBeLessThanOrEqual(58);

  await page.getByRole("button", { name: "展开侧栏" }).click();

  await expect(shell).toHaveAttribute("data-sidebar-expanded", "true");
  await page.waitForTimeout(260);
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await expect(sidebar).toHaveAttribute("data-reading-nav", "true");
  await expect(page.getByRole("button", { name: "阅读精选" })).toBeVisible();
  await expect(page.getByRole("link", { name: "文章" })).toBeVisible();
  await expect(page.getByRole("link", { name: "书籍" })).toBeVisible();
  await expect(page.getByRole("link", { name: "题目" })).toBeVisible();
  await expect(page.getByRole("link", { name: "导入" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "收藏夹" })).toHaveCount(0);

  const expanded = await page.evaluate(() => {
    const sidebarElement = document.querySelector(".desktop-app-sidebar");
    const viewportElement = document.querySelector(
      ".desktop-app-frame__viewport",
    );
    if (
      !(sidebarElement instanceof HTMLElement) ||
      !(viewportElement instanceof HTMLElement)
    ) {
      throw new Error("Sidebar layout elements are missing");
    }
    return {
      sidebarWidth: sidebarElement.getBoundingClientRect().width,
      viewportWidth: viewportElement.getBoundingClientRect().width,
    };
  });

  expect(expanded.sidebarWidth).toBeGreaterThanOrEqual(190);
  expect(expanded.sidebarWidth).toBeLessThanOrEqual(206);
  expect(expanded.viewportWidth).toBeLessThan(collapsed.viewportWidth - 100);
});

test("navigates through the floating sidebar without reloading the app shell", async ({
  page,
}) => {
  await page.goto("/notes");

  const shell = page.locator(".desktop-app-shell");

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");

  await page.evaluate(() => {
    (
      window as Window & {
        __desktopSidebarRouteMarker?: string;
      }
    ).__desktopSidebarRouteMarker = "kept-alive";
  });

  await page.locator('.desktop-app-sidebar__link[href="/video"]').click();

  await page.waitForURL("**/video");
  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");

  const routeMarker = await page.evaluate(
    () =>
      (
        window as Window & {
          __desktopSidebarRouteMarker?: string;
        }
      ).__desktopSidebarRouteMarker ?? null,
  );

  expect(routeMarker).toBe("kept-alive");
});

test("keeps the standalone home rail links clickable", async ({ page }) => {
  await page.goto("/");

  const rail = page.locator(".desktop-app-sidebar");

  await expect(rail).toBeVisible();
  await expect(rail.getByRole("link", { name: "本地笔记" })).toBeVisible();

  await rail.getByRole("link", { name: "本地笔记" }).click();

  await page.waitForURL("**/notes");
});

test("keeps the standalone home rail at the same dimensions as the app rail", async ({
  page,
}) => {
  await page.goto("/");

  const rail = page.locator(".desktop-app-sidebar");
  const firstButton = rail.locator(".desktop-app-sidebar__link").first();
  const home = page.getByRole("main");

  await expect(rail).toBeVisible();
  await expect(page.getByTestId("desktop-sidebar-expand-zone")).toHaveCount(0);
  await expect(home.getByRole("navigation", { name: "输出复习视图" })).toBeVisible();
  await expect(home.getByRole("button", { name: "添加知识点", exact: true }).first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const railElement = document.querySelector(".desktop-app-sidebar");
    const buttonElement = document.querySelector(".desktop-app-sidebar__link");

    if (
      !(railElement instanceof HTMLElement) ||
      !(buttonElement instanceof HTMLElement)
    ) {
      throw new Error("Home rail elements are missing");
    }

    const railRect = railElement.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();

    return {
      buttonHeight: buttonRect.height,
      buttonWidth: buttonRect.width,
      railWidth: railRect.width,
    };
  });

  await expect(firstButton).toBeVisible();
  expect(metrics.railWidth).toBe(30);
  expect(metrics.buttonWidth).toBe(28);
  expect(metrics.buttonHeight).toBe(28);
});

test("routes home rail actions to app workspaces", async ({ page }) => {
  await page.goto("/");

  const rail = page.locator(".desktop-app-sidebar");

  await rail.getByRole("link", { name: "本地笔记" }).click();
  await page.waitForURL("**/notes");

  await page.goto("/");
  await rail.getByRole("link", { name: "每日回顾" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "输出复习视图" })).toBeVisible();
});

test("keeps compact sidebar controls stable at home-rail dimensions", async ({
  page,
}) => {
  await page.goto("/video");

  const shell = page.locator(".desktop-app-shell");
  const sidebar = page.locator(".desktop-app-sidebar");
  const brand = page.locator(".desktop-app-sidebar__brand-img");
  const firstLink = page.locator(".desktop-app-sidebar__link").first();
  const firstLinkMark = page.locator(".desktop-app-sidebar__link-mark").first();

  await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
  await expect(shell).toHaveAttribute("data-sidebar-visible", "false");
  await expect(sidebar).toHaveAttribute("data-visible", "false");
  await expect(sidebar).toBeVisible();

  const initialMetrics = await page.evaluate(() => {
    const sidebarElement = document.querySelector(".desktop-app-sidebar");
    const brandElement = document.querySelector(
      ".desktop-app-sidebar__brand-img",
    );
    const linkElement = document.querySelector(".desktop-app-sidebar__link");
    const linkMarkElement = document.querySelector(
      ".desktop-app-sidebar__link-mark",
    );

    if (
      !(sidebarElement instanceof HTMLElement) ||
      !(brandElement instanceof HTMLElement) ||
      !(linkElement instanceof HTMLElement) ||
      !(linkMarkElement instanceof HTMLElement)
    ) {
      throw new Error("Desktop sidebar elements are missing");
    }

    const sidebarRect = sidebarElement.getBoundingClientRect();
    const brandRect = brandElement.getBoundingClientRect();
    const linkRect = linkElement.getBoundingClientRect();
    const linkMarkRect = linkMarkElement.getBoundingClientRect();

    return {
      brandHeight: brandRect.height,
      brandWidth: brandRect.width,
      linkHeight: linkRect.height,
      linkMarkHeight: linkMarkRect.height,
      linkMarkWidth: linkMarkRect.width,
      sidebarWidth: sidebarRect.width,
    };
  });

  expect(initialMetrics.sidebarWidth).toBeGreaterThanOrEqual(54);
  expect(initialMetrics.sidebarWidth).toBeLessThanOrEqual(58);
  expect(initialMetrics.brandWidth).toBe(28);
  expect(initialMetrics.brandHeight).toBe(28);
  expect(initialMetrics.linkHeight).toBe(36);
  expect(initialMetrics.linkMarkWidth).toBe(36);
  expect(initialMetrics.linkMarkHeight).toBe(36);

  await expect(brand).toBeVisible();
  await expect(firstLink).toBeVisible();
  await expect(firstLinkMark).toBeVisible();
});

test("preserves collapsed-rail geometry for top-level navigation when expanded", async ({
  page,
}) => {
  await page.goto("/notes");
  const shell = page.locator(".desktop-app-shell");
  const measure = async () =>
    page.evaluate(() => {
      const rectFor = (href: string) => {
        const element = document.querySelector<HTMLAnchorElement>(
          `.desktop-app-sidebar__link[href="${href}"]`,
        );
        if (!element) throw new Error(`Missing navigation link: ${href}`);
        const rect = element.getBoundingClientRect();
        return { height: rect.height, top: rect.top };
      };
      const home = rectFor("/");
      const notes = rectFor("/notes");
      return {
        gap: notes.top - (home.top + home.height),
        home,
        notes,
      };
    });

  await expect(shell).toHaveAttribute("data-sidebar-expanded", "false");
  const collapsed = await measure();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(shell).toHaveAttribute("data-sidebar-expanded", "true");
  await page.waitForTimeout(260);
  const expanded = await measure();

  expect(collapsed.home.height).toBeCloseTo(36, 1);
  expect(collapsed.notes.height).toBeCloseTo(36, 1);
  expect(collapsed.gap).toBeCloseTo(4, 1);
  expect(expanded.home.height).toBeCloseTo(collapsed.home.height, 1);
  expect(expanded.notes.height).toBeCloseTo(collapsed.notes.height, 1);
  expect(expanded.home.top).toBeCloseTo(collapsed.home.top, 1);
  expect(expanded.notes.top).toBeCloseTo(collapsed.notes.top, 1);
  expect(expanded.gap).toBeCloseTo(collapsed.gap, 1);
});
