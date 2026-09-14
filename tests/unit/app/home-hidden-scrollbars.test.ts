import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "components",
    "home",
    "home-demo-workbench.css",
  ),
  "utf8",
);

describe("home hidden scrollbars", () => {
  it("hides scrollbars in the home viewport and every nested widget without disabling scrolling", () => {
    expect(css).toContain(".desktop-app-shell:has(.auris-demo-home)");
    expect(css).toContain(".auris-demo-home *");
    expect(css).toContain("scrollbar-width: none;");
    expect(css).toContain("-ms-overflow-style: none;");
    expect(css).toContain(".auris-demo-home *::-webkit-scrollbar");
    expect(css).toContain("display: none;");
  });
});
