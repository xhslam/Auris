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

  it("keeps the article title on the packaged Reading foreground color", () => {
    const css = readFileSync(redesignCssPath, "utf-8");
    const titleRule = css.match(
      /\.reading-minimal \.reading-minimal__heading h1\s*\{([^}]*)\}/,
    );

    expect(titleRule?.[1]).toContain("color: #f2efe7");
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
      const background = themeRule?.match(
        /--reading-background:\s*(#[\da-f]{6})/i,
      )?.[1];
      const foreground = themeRule?.match(
        /--reading-foreground:\s*(#[\da-f]{6})/i,
      )?.[1];

      expect(background).toBeDefined();
      expect(foreground).toBeDefined();
      expect(contrastRatio(background!, foreground!)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
