import { readFileSync } from "node:fs";
import path from "node:path";

const globalsCssPath = path.join(process.cwd(), "src", "app", "globals.css");

describe("notes reading pane styles", () => {
  it("keeps desktop reading blocks on content-sized rows", () => {
    const css = readFileSync(globalsCssPath, "utf-8");

    expect(css).not.toMatch(
      /\.desktop-app-frame\s+\.notes-v2__reading-pane[^{]*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(
      /\.desktop-app-frame\s+\.notes-v2__reading-pane\s*\{[^}]*grid-auto-rows:\s*max-content/,
    );
  });
});
