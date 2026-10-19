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
  it('defines the 30px rectangular rail width', () => {
    expect(REDESIGN_CSS).toContain("--sidebar-rail-width: 30px");
  });

  it('fills the full-height shell column with no outer margin', () => {
    const rail = ruleBody(
      REDESIGN_CSS,
      '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-sidebar',
    );

    expect(rail).toContain("position: relative");
    expect(rail).toContain("left: auto");
    expect(rail).toContain("top: auto");
    expect(rail).toContain("margin: 0");
    expect(rail).toContain("width: 30px");
    expect(rail).toContain("height: auto");
    expect(rail).toContain("display: flex");
    expect(rail).toContain("justify-content: flex-start");
  });

  it("reserves a structural shell column instead of covering page content", () => {
    const shell = ruleBody(
      REDESIGN_CSS,
      '.desktop-app-shell[data-desktop-runtime="true"]',
    );
    const rail = ruleBody(
      REDESIGN_CSS,
      '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-sidebar',
    );
    const frame = ruleBody(
      REDESIGN_CSS,
      '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-frame',
    );

    expect(REDESIGN_CSS).toContain("--sidebar-shell-collapsed-column: 30px");
    expect(REDESIGN_CSS).not.toContain("--sidebar-shell-expanded-column");
    expect(shell).toContain("display: grid !important");
    expect(shell).toContain(
      "grid-template-columns: var(--sidebar-shell-collapsed-column, 30px) minmax(0, 1fr)",
    );
    expect(rail).toContain("position: relative");
    expect(rail).toContain("margin: 0");
    expect(rail).toContain("grid-column: 1");
    expect(frame).toContain("grid-column: 2");
    expect(frame).toContain("width: 100%");
  });

  it('uses a straight edge without floating shadow', () => {
    const rail = ruleBody(REDESIGN_CSS, '.desktop-app-shell[data-desktop-runtime="true"] .desktop-app-sidebar');
    expect(rail).toContain("border-radius: 0");
    expect(rail).toContain("box-shadow: none");
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

  it("keeps the Notes status cluster clear of the fixed rail", () => {
    expect(REDESIGN_CSS).toContain(
      "left: calc(var(--sidebar-rail-left, 0px) + var(--sidebar-rail-width, 30px) + 16px) !important;",
    );
    expect(GLOBALS_CSS).not.toContain(
      "left: calc(14px + var(--desktop-app-sidebar-width, 74px) + 16px) !important;",
    );
  });

  it("removes expansion geometry and idle hiding from the rail", () => {
    expect(REDESIGN_CSS).not.toContain("data-sidebar-expanded");
    expect(REDESIGN_CSS).not.toContain("brand-swap");
    expect(THEME_CSS).not.toContain("data-sidebar-expanded");
    expect(REDESIGN_CSS).not.toContain("data-chrome-hidden");
  });
});
