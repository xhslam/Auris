import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const redesignCssPath = path.join(
  process.cwd(),
  "src",
  "styles",
  "auris-redesign.css",
);

describe("notes welcome styles", () => {
  it("scopes themed controls strongly enough to override generic notes buttons", () => {
    const css = readFileSync(redesignCssPath, "utf-8");
    const welcomeRule = css.match(
      /\.desktop-app-frame\s+\.notes-v2--welcome\s*\{([^}]*)\}/,
    )?.[1];
    const actionRule = css.match(
      /\.desktop-app-frame\s+\.notes-v2--welcome\s+\.notes-welcome__action\s*\{([^}]*)\}/,
    )?.[1];
    const recentRule = css.match(
      /\.desktop-app-frame\s+\.notes-v2--welcome\s+\.notes-welcome__recent-item\s*\{([^}]*)\}/,
    )?.[1];

    expect(welcomeRule).toContain(
      "--notes-welcome-control: color-mix(in srgb, var(--notes-ink) 3%, var(--notes-bg))",
    );
    expect(actionRule).toContain("background: var(--notes-welcome-control)");
    expect(actionRule).toContain("border-radius: 8px");
    expect(recentRule).toContain("background: transparent");
    expect(recentRule).toContain("border-radius: 6px");
  });

  it.each(["white", "paper", "mint", "sepia", "night", "solarized"])(
    "provides the base palette used by welcome controls in the %s theme",
    (theme) => {
      const css = readFileSync(
        path.join(process.cwd(), "src", "app", "globals.css"),
        "utf-8",
      );
      const themeRule = css.match(
        new RegExp(
          `\\.notes-v2\\[data-notes-theme="${theme}"\\],[\\s\\S]*?\\{([^}]*)\\}`,
        ),
      )?.[1];

      expect(themeRule).toContain("--notes-bg:");
      expect(themeRule).toContain("--notes-ink:");
      expect(themeRule).toContain("--notes-muted:");
    },
  );
});
