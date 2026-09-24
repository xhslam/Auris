import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (content: string) => unknown };

interface BuilderFileAssociation {
  ext: string[];
  name?: string;
  rank?: string;
  role?: string;
}

interface BuilderConfig {
  mac?: {
    fileAssociations?: BuilderFileAssociation[];
  };
}

describe("electron-builder fileAssociations configuration", () => {
  it("declares non-intrusive Markdown file associations for macOS", () => {
    const builderConfigPath = path.resolve(__dirname, "../../../electron-builder.yml");
    const content = fs.readFileSync(builderConfigPath, "utf8");
    const config = yaml.load(content) as BuilderConfig;

    expect(config.mac).toBeDefined();
    expect(config.mac?.fileAssociations).toBeDefined();
    expect(Array.isArray(config.mac?.fileAssociations)).toBe(true);

    const mdAssoc = config.mac?.fileAssociations?.find((assoc) =>
      Array.isArray(assoc.ext) && assoc.ext.includes("md"),
    );

    expect(mdAssoc).toBeDefined();
    expect(mdAssoc?.name).toBe("Markdown Document");
    expect(mdAssoc?.role).toBe("Editor");
    // Must be Alternate, not Default, to avoid hijacking user's default markdown app
    expect(mdAssoc?.rank).toBe("Alternate");
    expect(mdAssoc?.ext).toEqual(["md", "markdown", "mdown", "mkd", "mkdn", "mdx"]);
  });
});
