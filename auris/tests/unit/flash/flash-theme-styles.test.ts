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

  it("inherits the active app palette instead of overriding themes locally", () => {
    const css = readFileSync(flashCssPath, "utf-8");
    expect(css).toContain("--flash-bg: var(--app-bg)");
    expect(css).toContain("--flash-accent: var(--accent)");
    expect(css).not.toContain("[data-app-theme=");
  });
});
