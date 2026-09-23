import { readFileSync } from "node:fs";
import path from "node:path";

const globalsCssPath = path.join(process.cwd(), "src", "app", "globals.css");
const redesignCssPath = path.join(process.cwd(), "src", "styles", "auris-redesign.css");

describe("notes editor layout styles", () => {
  it("reserves a separate desktop row for the source editor find toolbar", () => {
    const css = readFileSync(globalsCssPath, "utf-8");

    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2__editor-pane\[data-mode="source"\][^{]*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)/,
    );
  });

  it("keeps a 40px bottom bar without adding a second blocking status bar", () => {
    const css = readFileSync(redesignCssPath, "utf-8");

    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2--minimal::after\s*\{[^}]*content:\s*none/,
    );
    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2--minimal\s+\.notes-v2__editor-host--wysiwyg\s+\.ProseMirror/,
    );
    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2--minimal\s+\.notes-v2__editor-pane\s*\{[^}]*padding-bottom:\s*48px\s*!important/,
    );
    expect(css).toMatch(/padding-bottom:\s*48px\s*!important/);
    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2__corner-cluster\s*\{[^}]*bottom:\s*0\s*!important[^}]*height:\s*40px\s*!important/,
    );
    expect(css).toMatch(
      /\.notes-v2__corner-icon\s*\{[^}]*width:\s*24px\s*!important[^}]*height:\s*24px\s*!important/,
    );
  });
});
