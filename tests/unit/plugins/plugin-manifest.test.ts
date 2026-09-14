import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePluginManifest,
  parsePluginManifestJson,
} from "@/features/plugins/plugin-manifest";

describe("plugin manifest", () => {
  it("parses a plugin manifest and defaults the entry file to main.js", () => {
    const manifest = parsePluginManifest(
      {
        id: "daily-review",
        name: "Daily Review",
        version: "1.0.0",
      },
      "C:/vault/.shadowing/plugins/daily-review",
    );

    expect(manifest.id).toBe("daily-review");
    expect(manifest.entryFile).toBe("main.js");
    expect(manifest.entryPath).toBe(
      path.join("C:/vault/.shadowing/plugins/daily-review", "main.js"),
    );
  });

  it("supports a custom entry file from manifest json", () => {
    const manifest = parsePluginManifestJson(
      JSON.stringify({
        id: "flashcard-helper",
        main: "dist/index.js",
        name: "Flashcard Helper",
        version: "2.1.0",
      }),
      "C:/vault/.shadowing/plugins/flashcard-helper",
    );

    expect(manifest.entryFile).toBe("dist/index.js");
    expect(manifest.entryPath).toBe(
      path.join("C:/vault/.shadowing/plugins/flashcard-helper", "dist/index.js"),
    );
  });

  it("rejects manifests that do not declare the required identifiers", () => {
    expect(() =>
      parsePluginManifest(
        {
          name: "Broken Plugin",
          version: "1.0.0",
        },
        "C:/vault/.shadowing/plugins/broken",
      ),
    ).toThrow(/id/i);
  });
});
