import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const scoped = css.slice(css.indexOf("/* Notes: persistent file explorer"));

describe("reference explorer geometry", () => {
  it("uses a stable width instead of expanding with the viewport", () => {
    expect(scoped).toContain("--notes-explorer-width: 250px");
    expect(scoped).toContain("flex: 0 0 var(--notes-explorer-width)");
    expect(scoped).not.toContain("23vw");
    expect(scoped).toContain("--notes-explorer-width: 230px");
  });

  it("keeps virtual rows contiguous and draws non-interactive hierarchy guides", () => {
    expect(scoped).toMatch(/height: 34px; min-height: 34px/);
    expect(scoped).toMatch(/tree-node \{[^}]*margin: 0; padding: 0/);
    expect(scoped).toMatch(/tree-node::before \{[^}]*width: var\(--notes-tree-indent[^}]*pointer-events: none/);
    expect(scoped).toContain("transparent 16px 20px");
  });

  it("hides collapsed search and places vault and editor controls in separate columns", () => {
    expect(scoped).toMatch(/search\[hidden\] \{ display: none/);
    expect(scoped).toMatch(/explorer__footer \{[^}]*flex: 0 0 40px/);
    expect(scoped).toContain('data-explorer-open="true"');
    expect(scoped).toContain("left: calc(var(--notes-explorer-width) + 12px) !important");
    expect(scoped).not.toContain("68px");
  });
});
