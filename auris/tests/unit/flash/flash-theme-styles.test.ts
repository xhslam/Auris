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
  it("provides high-contrast card and text surface tokens with shared theme fallbacks", () => {
    const css = readFileSync(flashCssPath, "utf-8");

    expect(css).toContain("var(--flash-bg");
    expect(css).toContain("var(--flash-card-bg");
    expect(css).toContain("var(--flash-text-primary");
    expect(css).toContain("var(--app-bg)");
    expect(css).toContain("var(--app-surface)");
    expect(css).toContain("var(--app-text)");
    expect(css).toContain("var(--app-line)");
  });

  it.each(["white", "paper", "mint", "sepia", "night", "solarized"])(
    "configures theme-accurate colors for the %s app theme",
    (theme) => {
      const css = readFileSync(flashCssPath, "utf-8");

      expect(css).toContain(`[data-app-theme="${theme}"] .flash-workspace`);
    },
  );

  it("does not include legacy gold or amber accents in flash theme tokens", () => {
    const css = readFileSync(flashCssPath, "utf-8");

    // 严禁引入旧版金色、土黄色系高亮
    expect(css).not.toMatch(/#c7a86a/i); // Auris 默认金色
    expect(css).not.toMatch(/#d4b56e/i); // 旧夜间金色
    expect(css).not.toMatch(/#e1c55a/i); // 旧 Solarized 金色
    expect(css).not.toMatch(/#765214/i); // 旧白色泥金色
    expect(css).not.toMatch(/#6f4f18/i); // 旧纸张泥金色
  });
});
