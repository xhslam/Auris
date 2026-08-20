import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "components",
    "home",
    "home-demo-workbench.css",
  ),
  "utf8",
);

const themes = ["white", "paper", "mint", "sepia", "night", "solarized"];

describe("life stage theme scenes", () => {
  it("为每一种应用主题定义独立的场景背景与高对比前景令牌", () => {
    const sceneBackgrounds = themes.map((theme) => {
      const selector = `.desktop-app-shell[data-app-theme="${theme}"] .auris-demo-home[data-system-color-scheme] .demo-widget--life`;
      const start = css.indexOf(selector);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = css.slice(start, css.indexOf("\n}\n", start) + 3);
      expect(block).toContain("--life-scene-background:");
      expect(block).toContain("--life-scene-label:");
      expect(block).toContain("--life-scene-label-strong:");
      expect(block).toContain("--life-scene-note-bg:");
      return block.match(/--life-scene-background:\s*([\s\S]*?);\n/)?.[1];
    });

    expect(new Set(sceneBackgrounds).size).toBe(themes.length);
  });

  it("将场景背景、渐隐层、标签、记录和节点统一绑定到主题令牌", () => {
    expect(css).toContain("background: var(--life-scene-background);");
    expect(css).toContain("background: var(--life-scene-mist-top);");
    expect(css).toContain("background: var(--life-scene-mist-bottom);");
    expect(css).toContain("color: var(--life-scene-label);");
    expect(css).toContain("color: var(--life-scene-label-strong);");
    expect(css).toContain("background: var(--life-scene-note-bg);");
    expect(css).toContain("background: var(--life-scene-current);");
  });
});
