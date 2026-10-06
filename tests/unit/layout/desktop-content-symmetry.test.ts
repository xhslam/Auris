import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf-8",
);
const redesignCss = readFileSync(
  path.join(process.cwd(), "src", "styles", "auris-redesign.css"),
  "utf-8",
);

function getRuleBodies(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g");

  return [...css.matchAll(matcher)].map((match) => match[1]);
}

describe("desktop content symmetry", () => {
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

  it("keeps the Review home workspace attached to the live viewport at every shell layer", () => {
    const homeShellRules = getRuleBodies(
      redesignCss,
      '.desktop-app-shell[data-desktop-runtime="true"][data-workspace="home"]\n  .desktop-app-frame__viewport,\n.desktop-app-shell[data-desktop-runtime="true"][data-workspace="home"]\n  .desktop-app-frame__layout,\n.desktop-app-shell[data-desktop-runtime="true"][data-workspace="home"]\n  .desktop-app-frame__main',
    );

    expect(homeShellRules).toHaveLength(1);
    expect(homeShellRules[0]).toMatch(/height:\s*100%\s*!important/);
    expect(homeShellRules[0]).toMatch(/min-height:\s*0\s*!important/);
  });
});
