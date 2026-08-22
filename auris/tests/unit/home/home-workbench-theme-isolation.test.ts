import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(process.cwd(), "src", "components", "home", "home-demo-workbench.css"),
  "utf8",
);

const homeSelector = ".desktop-app-shell[data-app-theme] .auris-demo-home[data-system-color-scheme]";
const homeRuleSelector = `${homeSelector} {`;
const lifeSelector = `${homeSelector} .demo-widget--life {`;

function lastRuleBody(selector: string) {
  const start = css.lastIndexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}\n", start) + 3);
}

describe("home workbench theme isolation", () => {
  it("pins the home workbench to a dark local application palette", () => {
    const body = lastRuleBody(homeRuleSelector);

    expect(body).toContain("--app-bg: #171819;");
    expect(body).toContain("--app-surface: #202124;");
    expect(body).toContain("--app-ink: #f2efe9;");
    expect(body).toContain("--accent: #c5a85f;");
    expect(css.lastIndexOf(homeRuleSelector)).toBeGreaterThan(
      css.indexOf('.desktop-app-shell[data-app-theme="paper"] .auris-demo-home'),
    );
  });

  it("pins the life-stage canvas to the dark scene regardless of application theme", () => {
    const body = lastRuleBody(lifeSelector);

    expect(body).toContain("linear-gradient(180deg, #071421 0%, #112235 47%, #172b24 100%)");
    expect(body).toContain("--life-scene-label: #d8eee0;");
    expect(body).toContain("--life-scene-star-opacity: 1;");
    expect(css.lastIndexOf(lifeSelector)).toBeGreaterThan(
      css.indexOf('.desktop-app-shell[data-app-theme="paper"] .auris-demo-home'),
    );
  });
});
