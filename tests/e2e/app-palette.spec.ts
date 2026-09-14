import { expect, test } from "@playwright/test";

const themes = ["white", "paper", "mint", "sepia", "night", "solarized"];
const routes = ["/", "/notes", "/flash", "/review", "/reading", "/video", "/browser", "/settings", "/nia", "/focus", "/assessment"];
const localAccents: Record<string, string> = {
  ".auris-demo-home": "--home-v3-gold",
  ".home-v3": "--home-v3-gold",
  ".flash-workspace": "--flash-accent",
  ".output-review-page": "--review-accent",
  ".reading-library": "--reading-accent",
  ".reading-minimal[data-theme=light]": "--reading-accent",
  ".nia-workspace": "--nia-accent",
};

for (const route of routes) {
  test(`${route} follows one palette across all six theme switches`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(route);
    await expect(page.locator(".desktop-app-shell, .browser-window-root").first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-app-theme", /white|paper|mint|sepia|night|solarized/);
    for (const theme of themes) {
      await page.evaluate((theme) => {
        localStorage.setItem("auris.notes.reading-theme", theme);
        window.dispatchEvent(new CustomEvent("auris:app-theme", { detail: theme }));
      }, theme);
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", theme);
      const result = await page.evaluate((localAccents) => {
        const root = document.querySelector(".desktop-app-shell, .browser-window-root")!;
        const style = getComputedStyle(root);
        const read = (element: Element, token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          element.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const accent = read(root, "--accent");
        const aliases = Object.entries(localAccents).flatMap(([selector, token]) =>
          [...document.querySelectorAll(selector)].map((element) => ({ selector, color: read(element, token) })),
        );
        const luminance = (color: string) => {
          const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          });
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const ratio = (a: string, b: string) => {
          const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
          return (values[0] + .05) / (values[1] + .05);
        };
        return {
          accent,
          aliases,
          portalAccent: read(document.body, "--auris-primary"),
          primary: read(root, "--auris-primary"),
          ratios: ["--app-bg", "--app-surface"].flatMap(bg =>
            ["--app-ink", "--app-text", "--app-muted", "--accent"].map(fg => ({
              pair: `${fg} on ${bg}`, value: ratio(read(root, fg), read(root, bg)),
            })),
          ).concat({ pair: "primary button", value: ratio(accent, read(root, "--accent-ink")) }),
          background: style.getPropertyValue("--app-bg").trim(),
        };
      }, localAccents);
      if (theme === "night") expect(result.accent).toBe("rgb(245, 245, 245)");
      expect(result.primary).toBe(result.accent);
      expect(result.portalAccent).toBe(result.accent);
      for (const alias of result.aliases) expect(alias.color, `${theme}: ${alias.selector}`).toBe(result.accent);
      for (const check of result.ratios) expect(check.value, `${theme}: ${check.pair}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
