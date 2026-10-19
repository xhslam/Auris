import { expect, test } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

test.beforeEach(async ({ page }) => {
  await installLocalNotesBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("auris.appearance.window-preferences.v1", JSON.stringify({ hideStatus: true, focusDim: 0, titlebarName: false }));
    sessionStorage.setItem("auris.desktop.sidebar-expanded", "true");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

for (const route of ["/", "/notes", "/reading", "/video", "/settings", "/flash", "/nia"]) {
  test(`keeps a fixed rectangular rail visible on ${route}`, async ({ page }) => {
    await page.goto(route);
    const shell = page.locator(".desktop-app-shell");
    const rail = page.locator(".desktop-app-sidebar");
    await expect(shell).toHaveAttribute("data-desktop-runtime", "true");
    await expect(page.getByRole("button", { name: /展开侧栏|收起侧栏/ })).toHaveCount(0);
    await expect(shell).not.toHaveAttribute("data-sidebar-expanded");
    await expect(rail).toHaveCSS("opacity", "1");
    const before = await page.locator(".desktop-app-frame").boundingBox();
    const railBox = await rail.boundingBox();
    expect(railBox?.x).toBe(0);
    expect(railBox?.y).toBe(0);
    expect(railBox?.height).toBe(900);
    await page.waitForTimeout(3500);
    await expect(shell).not.toHaveAttribute("data-chrome-hidden");
    await expect(rail).toHaveCSS("opacity", "1");
    await expect(rail).toHaveCSS("border-radius", "0px");
    await expect(rail).toHaveCSS("width", "30px");
    expect(await page.locator(".desktop-app-frame").boundingBox()).toEqual(before);
  });
}
