import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(process.cwd(), "src", "components", "home", "home-demo-workbench.css"),
  "utf8",
);

const themes = ["white", "paper", "mint", "sepia", "night", "solarized"] as const;
const homeRoot = ".desktop-app-shell[data-app-theme] .auris-demo-home[data-system-color-scheme]";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBody(selector: string) {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`));
  expect(match, `Missing CSS rule: ${selector}`).not.toBeNull();
  return match![1];
}

describe("home workbench application-theme contract", () => {
  it("consumes the shell semantic palette rather than pinning a private dark palette", () => {
    expect(css).toContain("--bg: var(--app-bg);");
    expect(css).toContain("--panel: var(--app-surface);");
    expect(css).toContain("--ink: var(--app-ink);");
    expect(css).toContain("--muted: var(--app-muted);");
    expect(css).not.toMatch(
      new RegExp(`${escapeRegExp(homeRoot)}\\s*\\{[\\s\\S]*?--app-bg:`),
    );
  });

  it.each(themes)("provides a distinct %s life-stage scene bound to that application theme", (theme) => {
    const selector = `.desktop-app-shell[data-app-theme="${theme}"] .auris-demo-home[data-system-color-scheme] .demo-widget--life`;
    const body = ruleBody(selector);

    expect(body).toContain("--life-scene-background:");
    expect(body).toContain("--life-scene-label:");
    expect(body).toContain("--life-scene-note-bg:");
    expect(body).toContain("--life-scene-current:");
  });

  it("keeps the paper and night life-stage scenes visually distinct", () => {
    const paper = ruleBody(
      '.desktop-app-shell[data-app-theme="paper"] .auris-demo-home[data-system-color-scheme] .demo-widget--life',
    );
    const night = ruleBody(
      '.desktop-app-shell[data-app-theme="night"] .auris-demo-home[data-system-color-scheme] .demo-widget--life',
    );

    expect(paper).toContain("#f5e7bf");
    expect(night).toContain("#071421");
    expect(paper).not.toBe(night);
  });
});
