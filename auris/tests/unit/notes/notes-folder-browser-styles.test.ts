import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCssPath = path.join(process.cwd(), "src", "app", "globals.css");

function rule(css: string, selector: string, containing = "") {
  const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))]
    .map((match) => match[1] ?? "");
  return rules.find((body) => body.includes(containing)) ?? "";
}

describe("Notes folder browser styles", () => {
  it("keeps default list rows transparent and reserves surfaces for hover only", () => {
    const css = readFileSync(globalsCssPath, "utf-8");
    const rowRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-folder-browser__row",
      "background: transparent",
    );
    const hoverRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-folder-browser__row:hover",
    );
    expect(rowRule).toContain("background: transparent !important");
    expect(rowRule).toContain("border-radius: 0");
    expect(rowRule).toContain("border-bottom: 1px solid var(--notes-line)");
    expect(hoverRule).toContain("color-mix(in srgb, var(--notes-surface)");
    expect(css).not.toMatch(/notes-folder-browser__(?:card|row)\[data-selected/);
  });

  it("uses Notes and accent tokens rather than fixed gray values for browser surfaces", () => {
    const css = readFileSync(globalsCssPath, "utf-8");
    const browserStyles = css.slice(css.indexOf("/* Notes root / folder browser"));

    expect(browserStyles).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(browserStyles).not.toMatch(/(?:bg-)?(?:gray|zinc|neutral|slate)-/iu);
    expect(browserStyles).toContain("var(--notes-surface)");
    expect(browserStyles).toContain("var(--notes-line)");
    expect(browserStyles).toContain("var(--notes-bg)");
  });

  it("isolates file cards and rows from the generic Notes button fill", () => {
    const css = readFileSync(globalsCssPath, "utf-8");
    const cardRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-v2--folder-browser \\.notes-folder-browser__card",
      "background:",
    );
    const rowRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-v2--folder-browser \\.notes-folder-browser__row",
      "background:",
    );
    expect(cardRule).toContain("background: color-mix(in srgb, var(--notes-surface) 90%, var(--notes-bg)) !important");
    expect(css).toMatch(
      /notes-v2--folder-browser\s+\.notes-folder-browser__card,[\s\S]*?appearance: none !important/,
    );
    expect(rowRule).toContain("background: transparent !important");
    expect(css).not.toMatch(/notes-folder-browser__(?:card|row)\[data-selected/);
  });

  it.each(["white", "night", "solarized"])(
    "keeps the browser palette tokenized in the %s theme",
    (theme) => {
      const css = readFileSync(globalsCssPath, "utf-8");
      const themeRule = css.match(
        new RegExp(`\\.notes-v2\\[data-notes-theme=\\"${theme}\\"\\],[\\s\\S]*?\\{([^}]*)\\}`),
      )?.[1];

      expect(themeRule).toContain("--notes-bg:");
      expect(themeRule).toContain("--notes-surface:");
      expect(themeRule).toContain("--notes-line:");
      expect(themeRule).toContain("--notes-ink:");
      expect(themeRule).toContain("--notes-muted:");
    },
  );

  it("keeps Grid as the card-based variant while List uses dense row dimensions", () => {
    const css = readFileSync(globalsCssPath, "utf-8");
    const cardRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-folder-browser__card",
      "min-height: 176px",
    );
    const rowRule = rule(
      css,
      "\\.desktop-app-frame \\.notes-folder-browser__row",
      "min-height: 58px",
    );

    expect(cardRule).toContain("border-radius: 9px");
    expect(cardRule).toContain("min-height: 176px");
    expect(rowRule).toContain("min-height: 58px");
  });
});
