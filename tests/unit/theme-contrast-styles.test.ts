import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
const redesignCss = readFileSync(
  path.join(process.cwd(), "src/styles/auris-redesign.css"),
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
const niaCss = readFileSync(path.join(process.cwd(), "src/app/nia/nia.css"), "utf-8");
const reviewCss = readFileSync(
  path.join(process.cwd(), "src/components/review/output-review-page.css"),
  "utf-8",
);
const flashCss = readFileSync(
  path.join(process.cwd(), "src/components/flash/flash-page.css"),
  "utf-8",
);

const THEMES = ["white", "paper", "mint", "sepia", "night", "solarized"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let activeTheme = "mint";

function ruleBody(css: string, selector: string) {
  activeTheme = selector.match(/data-(?:app|notes)-theme="([^"]+)"/)?.[1] ?? activeTheme;
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS rule: ${selector}`).not.toBeNull();
  return match![1];
}

function variable(body: string, name: string): string {
  const match = body.match(new RegExp(`${escapeRegExp(name)}:\\s*([^;]+);`, "i"));
  expect(match, `Missing variable ${name}`).not.toBeNull();
  const value = match![1].trim();
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const reference = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!reference) throw new Error(`Unsupported color: ${value}`);
  const shell = ruleBody(globalsCss, `.desktop-app-shell[data-app-theme="${activeTheme}"]`);
  return variable(shell, reference);
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

  it.each(THEMES)("keeps %s Nia workspace text, accents, and tags at WCAG AA", (theme) => {
    const body = ruleBody(niaCss, `.desktop-app-shell[data-app-theme="${theme}"] .nia-workspace`);
    const background = variable(body, "--nia-bg");
    const surface = variable(body, "--nia-surface");

    for (const token of ["--nia-text", "--nia-text-2", "--nia-muted", "--nia-accent"]) {
      expectAa(background, variable(body, token), `${theme} Nia ${token}`);
    }

    expectAa(variable(body, "--nia-accent"), variable(body, "--nia-accent-ink"), `${theme} Nia accent ink`);
    expectAa(surface, variable(body, "--nia-done"), `${theme} Nia done`);
    expectAa(surface, variable(body, "--nia-cut"), `${theme} Nia cut`);

    // Verify Nia accent directly inherits the shell's active theme accent
    const shellBody = ruleBody(globalsCss, `.desktop-app-shell[data-app-theme="${theme}"]`);
    expect(variable(body, "--nia-accent")).toBe(variable(shellBody, "--accent"));
    expect(variable(body, "--nia-accent-ink")).toBe(variable(shellBody, "--accent-ink"));
  });

  it.each(THEMES)("keeps %s Flash workspace text, cards, and accent at high contrast (no gold)", (theme) => {
    const flashBody = ruleBody(flashCss, ".flash-workspace");
    expect(flashBody).toContain("--flash-bg: var(--app-bg)");
    expect(flashBody).toContain("--flash-card-bg: var(--app-surface)");
    expect(flashBody).toContain("--flash-text-primary: var(--app-ink)");
    expect(flashBody).toContain("--flash-text-secondary: var(--app-text)");
    expect(flashBody).toContain("--flash-accent: var(--accent)");
    expect(flashBody).toContain("--flash-accent-ink: var(--accent-ink)");

    const shellBody = ruleBody(globalsCss, `.desktop-app-shell[data-app-theme="${theme}"]`);
    const background = variable(shellBody, "--app-bg");
    const cardBg = variable(shellBody, "--app-surface");
    const textPrimary = variable(shellBody, "--app-ink");
    const textSecondary = variable(shellBody, "--app-text");
    const accent = variable(shellBody, "--accent");
    const accentInk = variable(shellBody, "--accent-ink");

    // 验证卡片正文在卡片上的对比度远超 WCAG AA (≥ 4.5:1)
    expectAa(cardBg, textPrimary, `${theme} Flash card text primary`);
    expectAa(cardBg, textSecondary, `${theme} Flash card text secondary`);
    // 验证强调色与前景色对比度符合 WCAG AA
    expectAa(accent, accentInk, `${theme} Flash accent ink`);
    // 验证强调色在页面底色上的对比度符合 WCAG AA
    expectAa(background, accent, `${theme} Flash accent on background`);
  });

  it("keeps Flash active navigation, composer, and cards using high-contrast flash tokens", () => {
    const activeNav = ruleBody(flashCss, '.flash-workspace__nav button[data-active="true"]');
    expect(activeNav).toContain("background: var(--flash-active-item-bg");
    expect(activeNav).toContain("color: var(--flash-active-item-text");

    const cardRule = ruleBody(flashCss, ".flash-card");
    expect(cardRule).toContain("border: 1px solid var(--flash-card-border");

    const submitRule = ruleBody(flashCss, ".flash-composer__submit:not(:disabled)");
    expect(submitRule).toContain("background: var(--flash-accent");
    expect(submitRule).toContain("color: var(--flash-accent-ink");
  });

  it("keeps Review warning badges and progress nodes at high contrast", () => {
    const darkReviewRule = ruleBody(
      reviewCss,
      '.desktop-app-shell[data-app-theme="night"] .auris-page.auris-review.output-review-page,\n.desktop-app-shell[data-app-theme="solarized"] .auris-page.auris-review.output-review-page',
    );
    const darkWarning = variable(darkReviewRule, "--review-warning");
    // Night surface is #212226
    expectAa("#212226", darkWarning, "night review warning");

    const baseReviewRule = ruleBody(reviewCss, ".auris-page.auris-review.output-review-page");
    const lightWarning = variable(baseReviewRule, "--review-warning");
    // Mint surface is #f4f7f1
    expectAa("#f4f7f1", lightWarning, "light review warning");
  });

  it.each(THEMES)("keeps %s Review accent non-gold and at WCAG AA", (theme) => {
    const shellBody = ruleBody(globalsCss, `.desktop-app-shell[data-app-theme="${theme}"]`);
    const reviewBody = ruleBody(
      reviewCss,
      `.desktop-app-shell[data-app-theme="${theme}"] .auris-page.auris-review.output-review-page`,
    );
    const background = variable(shellBody, "--app-bg");
    const accent = variable(reviewBody, "--review-accent");
    const accentInk = variable(reviewBody, "--review-accent-ink");

    expectAa(background, accent, `${theme} Review accent`);
    expectAa(accent, accentInk, `${theme} Review accent ink`);
    expect(["#c7a86a", "#d4b56e", "#e1c55a", "#765214", "#6f4f18", "#684817"])
      .not.toContain(accent.toLowerCase());
  });
});
