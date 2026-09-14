import { describe, expect, it } from "vitest";
import { detectStructuredSchema } from "@/features/notes/formats/structured-schema";

describe("structured schema detection", () => {
  it.each([
    [
      "json",
      "package.json",
      { name: "auris", dependencies: { react: "19" } },
      "package-json",
    ],
    [
      "json",
      "tsconfig.app.json",
      { compilerOptions: { strict: true } },
      "tsconfig-json",
    ],
    [
      "yaml",
      "project/.github/workflows/ci.yml",
      { jobs: { test: {} }, on: "push" },
      "gha-workflow",
    ],
    [
      "yaml",
      "compose.yaml",
      { services: { web: {}, db: {} } },
      "docker-compose",
    ],
    [
      "yaml",
      "openapi.yaml",
      { info: { title: "Auris" }, openapi: "3.1.0", paths: {} },
      "openapi",
    ],
    [
      "toml",
      "Cargo.toml",
      { dependencies: { serde: "1" }, package: { name: "auris" } },
      "cargo-toml",
    ],
    [
      "toml",
      "pyproject.toml",
      { project: { name: "auris" }, tool: { ruff: {} } },
      "pyproject-toml",
    ],
  ] as const)(
    "detects %s schema for %s",
    (format, path, value, expectedSchema) => {
      expect(detectStructuredSchema(format, path, value)?.id).toBe(
        expectedSchema,
      );
    },
  );

  it("returns null for generic structured data", () => {
    expect(
      detectStructuredSchema("json", "lesson.json", {
        lesson: "Grammar",
        score: 92,
      }),
    ).toBeNull();
  });
});
