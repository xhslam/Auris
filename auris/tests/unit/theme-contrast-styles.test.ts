import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
const redesignCss = readFileSync(
  path.join(process.cwd(), "src/styles/auris-redesign.css"),
  "utf-8",
);
const homeCss = readFileSync(
  path.join(process.cwd(), "src/components/home/home-v3.css"),
  "utf-8",
);
const readingLibraryCss = readFileSync(
  path.join(process.cwd(), "src/components/reading/reading-library.css"),
  "utf-8",
);
const readingWorkbenchCss = readFileSync(
  path.join(process.cwd(), "src/components/reading/reading-workbench.css"),
  "utf-8",
);

const THEMES = ["white", "paper", "mint", "sepia", "night", "solarized"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBody(css: string, selector: string) {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS rule: ${selector}`).not.toBeNull();
  return match![1];
}

function variable(body: string, name: string) {
  const match = body.match(new RegExp(`${escapeRegExp(name)}:\\s*(#[\\da-f]{6})`, "i"));
  expect(match, `Missing hex variable ${name}`).not.toBeNull();
  return match![1];
}

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

function expectAa(background: string, foreground: string, label: string) {
  expect(
    contrastRatio(background, foreground),
    `${label}: ${foreground} on ${background}`,
  ).toBeGreaterThanOrEqual(4.5);
}

describe("application theme contrast", () => {
  it.each(THEMES)("keeps %s shell content and accent at WCAG AA", (theme) => {
    const body = ruleBody(globalsCss, `.desktop-app-shell[data-app-theme="${theme}"]`);
    const background = variable(body, "--app-bg");

    for (const token of ["--app-ink", "--app-text", "--app-text-soft", "--app-muted", "--accent"]) {
      expectAa(background, variable(body, token), `${theme} ${token}`);
    }

    expectAa(variable(body, "--accent"), variable(body, "--accent-ink"), `${theme} accent ink`);
  });

  it.each(THEMES)("keeps %s Notes body and muted text at WCAG AA", (theme) => {
    const body = ruleBody(
      globalsCss,
      `.desktop-app-frame .notes-v2[data-notes-theme="${theme}"]`,
    );
    const background = variable(body, "--notes-bg");

    for (const token of ["--notes-text", "--notes-ink", "--notes-muted"]) {
      expectAa(background, variable(body, token), `${theme} Notes ${token}`);
    }
  });

  it.each(THEMES)("keeps %s home labels at WCAG AA", (theme) => {
    const body = ruleBody(homeCss, `.desktop-app-shell[data-app-theme="${theme}"] .home-v3`);
    const background = variable(body, "--home-v3-bg");

    for (const token of [
      "--home-v3-text",
      "--home-v3-soft",
      "--home-v3-muted",
      "--home-v3-faint",
      "--home-v3-gold",
    ]) {
      expectAa(background, variable(body, token), `${theme} home ${token}`);
    }
  });

  it.each(THEMES)("keeps %s Reading library metadata at WCAG AA", (theme) => {
    const body = ruleBody(
      readingLibraryCss,
      `.desktop-app-shell[data-app-theme="${theme}"] .reading-library`,
    );
    const background = variable(body, "--reading-background");

    for (const token of ["--reading-foreground", "--reading-muted", "--reading-accent"]) {
      expectAa(background, variable(body, token), `${theme} Reading library ${token}`);
    }
  });

  it.each(THEMES)("keeps %s Reading workbench metadata at WCAG AA", (theme) => {
    const body = ruleBody(
      readingWorkbenchCss,
      `.desktop-app-shell[data-app-theme="${theme}"] .reading-minimal[data-theme="light"]`,
    );
    const background = variable(body, "--reading-background");

    for (const token of ["--reading-foreground", "--reading-muted", "--reading-accent"]) {
      expectAa(background, variable(body, token), `${theme} Reading workbench ${token}`);
    }
  });

  it("keeps Review typography and surfaces on theme tokens", () => {
    const forbidden = ["#f2efe7", "#8c887e", "#6e6a62", "rgba(255, 255, 255"];
    const reviewSection = redesignCss.slice(
      redesignCss.indexOf("* 10. Review"),
      redesignCss.indexOf("* 12. Workspace"),
    );

    for (const value of forbidden) {
      expect(reviewSection.toLowerCase()).not.toContain(value.toLowerCase());
    }
    expect(reviewSection).toContain("var(--app-ink)");
    expect(reviewSection).toContain("var(--app-muted)");
    expect(reviewSection).toContain("var(--accent-ink)");
  });
});
