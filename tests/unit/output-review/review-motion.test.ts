import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), "src/components/review", file), "utf8");
const css = read("review-motion.css");
const tree = postcss.parse(css);

describe("Review motion boundaries", () => {
  it("loads an isolated motion layer without changing layout, interaction or focus", () => {
    expect(read("review-page-client.tsx")).toContain('import "@/components/review/review-motion.css"');
    tree.walkDecls((decl) => {
      expect(["display", "position", "overflow", "height", "width", "pointer-events", "visibility"]).not.toContain(decl.prop);
    });
    expect(css).not.toMatch(/\binfinite\b|\bwill-change\s*:/);
  });

  it("collapses all delays, durations and repetition for reduced motion", () => {
    const media = tree.nodes.find((node) => node.type === "atrule" && node.name === "media" && node.params === "(prefers-reduced-motion: reduce)");
    expect(media).toBeDefined();
    const declarations = new Map<string, string>();
    if (media?.type === "atrule") media.walkDecls((decl) => {
      expect(decl.important).toBe(true);
      declarations.set(decl.prop, decl.value);
    });
    expect(Object.fromEntries(declarations)).toMatchObject({
      "animation-delay": "0ms", "animation-duration": ".01ms", "animation-iteration-count": "1",
      "transition-delay": "0ms", "transition-duration": ".01ms", "scroll-behavior": "auto",
    });
  });

  it("rotates only decorative spokes, preserving the centered hub and existing manual wheel logic", () => {
    const wheel = read("review-wheel-workspace.tsx");
    expect(wheel).toContain('"--review-wheel-turn": `${-rotation * 120}deg`');
    expect(wheel).toContain('inert={active !== index}');
    expect(wheel).toContain('performance.now() - lastTurn.current < 1200');
    tree.walkRules((rule) => {
      const hasRotate = rule.nodes.some((node) => node.type === "decl" && node.prop === "rotate" && node.value.includes("--review-wheel-turn"));
      if (hasRotate) {
        expect(rule.selector).toContain(".review-wheel__rim::before");
        expect(rule.selector).toContain(".review-wheel__rim > i");
      }
    });
  });

  it("uses composited entry motion, without holding transforms on ancestors of fixed overlays", () => {
    tree.walkDecls("animation", (decl) => {
      expect(decl.value).toContain("backwards");
      expect(decl.value).not.toMatch(/\bforwards\b|\bboth\b/);
    });
    const metrics = read("review-page-client.tsx");
    expect(metrics).toContain('key={`${metrics.completedToday}/${metrics.totalActionableToday}`}');
    expect(metrics).toContain('key={notice} role="status"');
  });
});
