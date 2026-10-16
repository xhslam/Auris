import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadConfig(name: string) {
  const config = ts.getParsedCommandLineOfConfigFile(path.join(root, name), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) throw new Error(`Unable to read ${name}`);
  expect(config.errors).toEqual([]);
  return config;
}

function relativeFiles(config: ts.ParsedCommandLine) {
  return config.fileNames.map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
}

describe("TypeScript gates", () => {
  it("keeps strict no-emit checks and excludes mirrors/backups, not live tests", () => {
    for (const name of ["tsconfig.json", "tsconfig.source.json", "tsconfig.tests.json"]) {
      const config = loadConfig(name);
      expect(config.options.strict).toBe(true);
      expect(config.options.noEmit).toBe(true);
      expect(config.options.allowJs).toBe(false);
      const files = relativeFiles(config);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => /^(release|auris|vmark-upstream|node_modules)\//.test(file))).toBe(false);
    }
  });

  it("covers every current source and test root, including integration and E2E", () => {
    const all = relativeFiles(loadConfig("tsconfig.json"));
    const source = new Set(relativeFiles(loadConfig("tsconfig.source.json")));
    const tests = new Set(relativeFiles(loadConfig("tsconfig.tests.json")));
    const sourceFiles = all.filter((file) => file.startsWith("src/"));
    const testFiles = all.filter((file) => file.startsWith("tests/"));
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(testFiles.length).toBeGreaterThan(0);
    expect(sourceFiles.filter((file) => !source.has(file))).toEqual([]);
    expect(testFiles.filter((file) => !tests.has(file))).toEqual([]);
    expect([...source].some((file) => file.startsWith("tests/"))).toBe(false);
    expect(tests.has("tests/e2e/app-smoke.spec.ts")).toBe(true);
    expect(tests.has("tests/integration/browser-authority-adversarial.test.ts")).toBe(true);
    expect(source.has("electron/shared/browser-contract.d.cts")).toBe(true);
    expect(source.has("electron/mcp/browser-tool-contract.d.mts")).toBe(true);
  });

  it("runs route generation and all three checks without ignoring failures", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toBe(
      "npm run typecheck:routes && npm run typecheck:source && npm run typecheck:tests && npm run typecheck:all",
    );
    expect(pkg.scripts["typecheck:routes"]).toBe("next typegen");
    for (const [scope, config] of [["source", "tsconfig.source.json"], ["tests", "tsconfig.tests.json"], ["all", "tsconfig.json"]]) {
      expect(pkg.scripts[`typecheck:${scope}`]).toBe(`tsc --project ${config} --noEmit --incremental false`);
    }
    expect(fs.readFileSync(path.join(root, "next.config.ts"), "utf8")).not.toMatch(/ignoreBuildErrors\s*:\s*true/);
  });

  it("enforces the same aggregate command in CI without narrow path filters", () => {
    const workflow = parse(fs.readFileSync(path.join(root, ".github/workflows/typecheck.yml"), "utf8")) as {
      on: Record<string, { paths?: string[] } | null>;
      jobs: Record<string, {
        "continue-on-error"?: boolean;
        steps: Array<{ run?: string; "continue-on-error"?: boolean }>;
      }>;
    };
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(["pull_request", "push", "workflow_dispatch"]));
    expect(workflow.on.pull_request?.paths).toBeUndefined();
    expect(workflow.on.push?.paths).toBeUndefined();
    const job = workflow.jobs.typecheck;
    expect(job["continue-on-error"]).not.toBe(true);
    const check = job.steps.find((step) => step.run === "npm run typecheck");
    expect(check).toBeDefined();
    expect(check?.["continue-on-error"]).not.toBe(true);
  });
});
