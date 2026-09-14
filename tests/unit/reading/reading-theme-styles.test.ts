import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const redesignCssPath = path.join(
  process.cwd(),
  "src",
  "styles",
  "auris-redesign.css",
);
const workbenchCssPath = path.join(
  process.cwd(),
  "src",
  "components",
  "reading",
  "reading-workbench.css",
);
const libraryCssPath = path.join(
  process.cwd(),
  "src",
  "components",
  "reading",
  "reading-library.css",
);
const settingsCssPath = path.join(
  process.cwd(),
  "src",
  "components",
  "reading",
  "reader-settings-dialog.css",
);

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported color: ${hex}`);
  }
  const [red, green, blue] = channels.map(channelToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Reading theme styles", () => {
  it("derives the settings dialog from the active reader theme with layered contrast", () => {
    const css = readFileSync(settingsCssPath, "utf-8");
    const dialogRule = css.match(/\.reader-settings\s*\{([^}]*)\}/)?.[1];
    const bodyRule = css.match(/\.reader-settings__body\s*\{([^}]*)\}/)?.[1];

    expect(dialogRule).toContain("--rs-bg: var(--reading-background)");
    expect(dialogRule).toContain("--rs-text: var(--reading-foreground)");
    expect(dialogRule).toContain("--rs-focus: var(--reading-accent)");
    expect(dialogRule).toContain("var(--reading-foreground) 28%");
    expect(bodyRule).toContain("background: var(--rs-panel-soft)");
    expect(bodyRule).toContain("border: 1px solid var(--rs-line)");
  });

  it("uses the app sans font throughout the Reading surfaces", () => {
    const redesignCss = readFileSync(redesignCssPath, "utf-8");
    const workbenchCss = readFileSync(workbenchCssPath, "utf-8");
    const libraryCss = readFileSync(libraryCssPath, "utf-8");

    const selectors = [
      [libraryCss, ".reading-library"],
      [workbenchCss, ".reading-minimal"],
      [workbenchCss, ".reading-minimal__word-popover"],
      [redesignCss, ".reading-minimal .reading-minimal__heading h1"],
      [redesignCss, ".reading-minimal .reading-minimal__meta"],
      [redesignCss, ".reading-minimal .reading-minimal__english"],
      [redesignCss, ".reading-minimal .reading-minimal__translation"],
    ] as const;

    for (const [css, selector] of selectors) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

      expect(rule?.[1], selector).toContain(
        "font-family: var(--auris-font-sans)",
      );
    }
  });

  it("keeps the Reading heading below the native desktop island", () => {
    const css = readFileSync(libraryCssPath, "utf-8");
    const canvasRule = css.match(
      /\.desktop-app-shell\[data-desktop-runtime="true"\] \.reading-library__canvas\s*\{([^}]*)\}/,
    )?.[1];

    expect(canvasRule).toContain("padding-top: clamp(82px, 10vh, 104px)");
  });

  it("keeps the article title on the active Reading foreground token", () => {
    const css = readFileSync(redesignCssPath, "utf-8");
    const titleRule = css.match(
      /\.reading-minimal \.reading-minimal__heading h1\s*\{([^}]*)\}/,
    );

    expect(titleRule?.[1]).toContain("color: var(--reading-foreground)");
  });

  it("applies reader typography controls to exam and study-guide content", () => {
    const css = readFileSync(workbenchCssPath, "utf-8");
    const bodyRule = css.match(/\.reading-exam__block-body\s*\{([^}]*)\}/)?.[1];
    const paragraphRules = Array.from(
      css.matchAll(/\.reading-exam__paragraph\s*\{([^}]*)\}/g),
      (match) => match[1] ?? "",
    );
    const studyLayoutRule = css.match(
      /\.reading-exam__section\[data-layout="reading-study"\] \.reading-exam__section-layout\s*\{([^}]*)\}/,
    )?.[1];

    expect(bodyRule).toContain("font-family: var(--reading-font-family");
    expect(bodyRule).toContain("font-weight: var(--reading-font-weight");
    expect(bodyRule).toContain("letter-spacing: var(--reading-letter-spacing");
    expect(bodyRule).toContain("line-height: var(--reading-line-height");
    expect(bodyRule).toContain("text-align: var(--reading-text-align");
    expect(bodyRule).toContain("word-spacing: var(--reading-word-spacing");
    expect(bodyRule).toContain("hyphens: var(--reading-hyphens");
    expect(paragraphRules.some((rule) =>
      rule.includes("text-indent: var(--reading-paragraph-indent"),
    )).toBe(true);
    expect(studyLayoutRule).toContain("var(--reading-line-width");
  });

  it("anchors every exam format to one centered reading canvas", () => {
    const css = readFileSync(workbenchCssPath, "utf-8");
    const shellRule = css.match(/\.reading-minimal__shell\s*\{([^}]*)\}/)?.[1];
    const pageRule = css.match(/\.reading-minimal__page\s*\{([^}]*)\}/)?.[1];
    const examContentRule = css.match(
      /\.reading-minimal\[data-content-kind="exam"\] \.reading-minimal__content\s*\{([^}]*)\}/,
    )?.[1];
    const examCanvasRule = css.match(
      /\.reading-minimal\[data-content-kind="exam"\] \.reading-exam\s*\{([^}]*)\}/,
    )?.[1];

    expect(shellRule).toContain("inline-size: 100%");
    expect(shellRule).toContain("justify-items: center");
    expect(pageRule).toContain("justify-self: center");
    expect(pageRule).toContain("margin-inline: auto");
    expect(examContentRule).toContain("justify-items: center");
    expect(examCanvasRule).toContain("inline-size: min(100%, 1240px)");
  });

  it.each(["white", "paper", "mint", "sepia", "night", "solarized"])(
    "keeps the %s title color readable against its Reading background",
    (theme) => {
      const css = readFileSync(workbenchCssPath, "utf-8");
      const themeRule = css.match(
        new RegExp(
          `\\.desktop-app-shell\\[data-app-theme="${theme}"\\] \\.reading-minimal\\[data-theme="light"\\]\\s*\\{([^}]*)\\}`,
        ),
      )?.[1];
      expect(themeRule).toContain("--reading-background: var(--app-bg)");
      expect(themeRule).toContain("--reading-foreground: var(--app-text)");
      const shellCss = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
      const shellRule = shellCss.match(new RegExp(`\\.desktop-app-shell\\[data-app-theme="${theme}"\\]\\s*\\{([^}]*)\\}`))?.[1];
      const background = shellRule?.match(/--app-bg:\s*(#[\da-f]{6})/i)?.[1];
      const foreground = shellRule?.match(/--app-text:\s*(#[\da-f]{6})/i)?.[1];

      expect(background).toBeDefined();
      expect(foreground).toBeDefined();
      expect(contrastRatio(background!, foreground!)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
