import { readFileSync } from "node:fs";
import path from "node:path";

const flashCssPath = path.join(
  process.cwd(),
  "src",
  "components",
  "flash",
  "flash-page.css",
);

describe("flash theme styles", () => {
  it("derives its primary surfaces from the shared app theme tokens", () => {
    const css = readFileSync(flashCssPath, "utf-8");

    expect(css).toContain("background: var(--app-bg)");
    expect(css).toContain("background: var(--app-surface)");
    expect(css).toContain("color: var(--app-text)");
    expect(css).toContain("border-color: var(--app-line)");
  });

  it.each(["white", "paper", "mint", "sepia", "night", "solarized"])(
    "inherits the %s app theme without a page-specific color override",
    (theme) => {
      const css = readFileSync(flashCssPath, "utf-8");

      expect(css).not.toContain(`[data-app-theme="${theme}"]`);
    },
  );
});
