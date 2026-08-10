import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf-8",
);
const homeCss = readFileSync(
  path.join(process.cwd(), "src", "components", "home", "home-v3.css"),
  "utf-8",
);

function getRuleBodies(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g");

  return [...css.matchAll(matcher)].map((match) => match[1]);
}

function getOuterColumnMinimums(css: string) {
  return [...css.matchAll(
    /\.home-v3__grid\s*\{[^}]*grid-template-columns:\s*minmax\((\d+)px,\s*[\d.]+fr\)\s+minmax\([^;]+\)\s+minmax\((\d+)px,\s*[\d.]+fr\)/g,
  )].map((match) => [Number(match[1]), Number(match[2])]);
}

describe("desktop content symmetry", () => {
  it("keeps the home grid's left and right rails equal at every desktop layout", () => {
    const outerColumnMinimums = getOuterColumnMinimums(homeCss);

    expect(outerColumnMinimums.length).toBeGreaterThanOrEqual(2);
    for (const [leftMinimum, rightMinimum] of outerColumnMinimums) {
      expect(rightMinimum).toBe(leftMinimum);
    }
  });

  it("sizes the desktop frame and notes page from their parent instead of the viewport", () => {
    const desktopFrameRules = getRuleBodies(
      globalsCss,
      '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-frame,\n.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-frame__viewport',
    );
    const notesPageRules = getRuleBodies(globalsCss, ".notes-v2-page");

    expect(desktopFrameRules.length).toBeGreaterThanOrEqual(2);
    expect(notesPageRules).toHaveLength(1);

    for (const rule of [...desktopFrameRules, ...notesPageRules]) {
      expect(rule).not.toMatch(/(?:width|max-width):\s*100vw/);
    }

    expect(notesPageRules[0]).toMatch(/width:\s*100%/);
    expect(notesPageRules[0]).toMatch(/max-width:\s*100%/);
  });
});
