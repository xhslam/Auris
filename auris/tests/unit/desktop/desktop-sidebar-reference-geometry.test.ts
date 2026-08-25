import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REDESIGN_CSS = readFileSync(
  resolve(__dirname, "../../../src/styles/auris-redesign.css"),
  "utf-8",
);
const GLOBALS_CSS = readFileSync(
  resolve(__dirname, "../../../src/app/globals.css"),
  "utf-8",
);
const THEME_CSS = readFileSync(
  resolve(__dirname, "../../../src/styles/auris-theme.css"),
  "utf-8",
);

function ruleBody(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));

  expect(match, `Missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe('Desktop sidebar reference geometry contract', () => {
  // Test that required geometry values exist
  it('defines the 30px capsule rail width', () => {
    expect(REDESIGN_CSS).toContain("--sidebar-rail-width: 30px");
  });

  it('positions the rail at 8px from left and top', () => {
    const rail = ruleBody(
      REDESIGN_CSS,
      '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-sidebar',
    );

    expect(rail).toContain("left: 8px");
    expect(rail).toContain("top: 8px");
    expect(rail).toContain("width: 30px");
    expect(rail).toContain("height: calc(100vh - 16px)");
    expect(rail).toContain("display: flex");
    expect(rail).toContain("justify-content: flex-start");
  });

  it('uses 15px border-radius for capsule shape', () => {
    expect(REDESIGN_CSS).toContain("border-radius: 15px");
  });

  it('sizes nav items at 28×28px', () => {
    expect(REDESIGN_CSS).toContain("--sidebar-item-size: 28px");
  });

  it('sizes glyphs at 14×14px', () => {
    expect(REDESIGN_CSS).toContain("--sidebar-glyph-size: 14px");
  });

  it('defines 2×20px active indicator', () => {
    expect(REDESIGN_CSS).toContain("--sidebar-indicator-width: 2px");
    expect(REDESIGN_CSS).toContain("--sidebar-indicator-height: 20px");
  });

  // Night theme colors
  it('uses Night theme rail surface #2B2E33', () => {
    expect(REDESIGN_CSS.toLowerCase()).toContain("#2b2e33");
  });

  it('uses Night theme active surface #333D4B', () => {
    expect(REDESIGN_CSS.toLowerCase()).toContain("#333d4b");
  });

  it('uses coral indicator color #E55E51', () => {
    expect(REDESIGN_CSS.toLowerCase()).toContain("#e55e51");
  });

  it('uses blue active icon color #6BA4F8', () => {
    expect(REDESIGN_CSS.toLowerCase()).toContain("#6ba4f8");
  });

  // Ensure old values are NOT present in sidebar rules
  // Note: we check for specific patterns, not just any occurrence
  it('does not define 48px, 74px, or 78px sidebar width', () => {
    // Match patterns like `--sidebar-rail-width: 48px` or `--auris-sidebar-rail: 48px`
    // but not unrelated 48px values
    expect(REDESIGN_CSS).not.toMatch(/--(?:sidebar|auris-sidebar)[^;]*:\s*48px/i);
    expect(REDESIGN_CSS).not.toMatch(/--(?:sidebar|auris-sidebar)[^;]*:\s*74px/i);
    expect(REDESIGN_CSS).not.toMatch(/--(?:sidebar|auris-sidebar)[^;]*:\s*78px/i);
  });

  it('does not use gold active fill on sidebar links', () => {
    // The sidebar active rules should not contain gold rgba(199, 168, 106 backgrounds
    // We check that the CSS near data-active does not reference this gold color
    const activeBlocks = REDESIGN_CSS.match(
      /\.desktop-app-sidebar__link\[data-active="true"\][^}]*}/g
    ) || [];
    for (const block of activeBlocks) {
      expect(block).not.toContain("rgba(199, 168, 106");
    }
  });

  it("removes legacy important declarations that would beat the redesign cascade", () => {
    expect(GLOBALS_CSS).not.toMatch(
      /\.desktop-app-shell\[data-desktop-runtime="true"\]\s+\.desktop-app-sidebar\s*\{[^}]*?(?:left:\s*0|top:\s*0|width:[^;]*48px|border-radius:\s*0)[^}]*?!important/is,
    );
    expect(GLOBALS_CSS).not.toMatch(
      /\.desktop-app-shell\[data-desktop-runtime="true"\]\s+\.desktop-app-sidebar__link\s*\{[^}]*?(?:width|height|min-height):\s*36px\s*!important/is,
    );
    expect(GLOBALS_CSS).not.toMatch(
      /\.desktop-app-shell\[data-app-theme\][^}]*rgba\(199,\s*168,\s*106,\s*0\.12\)\s*!important/is,
    );
  });

  it("keeps the Notes status cluster clear of the floating capsule", () => {
    expect(REDESIGN_CSS).toContain(
      "left: calc(var(--sidebar-rail-left, 8px) + var(--sidebar-rail-width, 30px) + 16px) !important;",
    );
    expect(GLOBALS_CSS).not.toContain(
      "left: calc(14px + var(--desktop-app-sidebar-width, 74px) + 16px) !important;",
    );
  });

  it("lets the explicit 240px expanded state reveal all navigation labels", () => {
    const expandedSelector =
      '.desktop-app-shell[data-desktop-runtime="true"][data-sidebar-expanded="true"]\n  .desktop-app-sidebar';
    const expanded = ruleBody(REDESIGN_CSS, expandedSelector);

    expect(expanded).toContain("width: var(--auris-sidebar-wide, 240px)");
    expect(expanded).toContain("border-radius: 16px");
    expect(REDESIGN_CSS).toMatch(
      /\[data-sidebar-expanded="true"\][\s\S]*?\.desktop-app-sidebar__link-text\s*\{[\s\S]*?display:\s*inline/,
    );
    expect(THEME_CSS).not.toContain(
      ".desktop-app-sidebar__link-text {\n  display: none !important;",
    );
  });
});
