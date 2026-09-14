import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import canonical from "../../../electron/shared/browser-workflow-contract.cjs";
import * as compiler from "../../../src/features/workflows/browser-workflow-compiler";
import * as parser from "../../../src/features/workflows/browser-workflow-parser";
import * as schema from "../../../src/features/workflows/browser-workflow-schema";
import * as stepPolicy from "../../../src/features/workflows/browser-workflow-step-policy";

const require = createRequire(import.meta.url);
const canonicalPath = path.resolve("electron/shared/browser-workflow-contract.cjs");

function fixture(name: string): string {
  return readFileSync(path.resolve("tests/fixtures/workflows", name), "utf8");
}

const VALID = fixture("browser-research.md");
const HOSTILE = fixture("browser-hostile.md");

const INLINE_CASES: Array<{ label: string; source: string; ok: boolean }> = [
  {
    label: "minimal extract",
    source: `---\nsite: example.com\n---\n\n1. extract: title\n`,
    ok: true,
  },
  {
    label: "confirmed click",
    source: `---\nsite: example.com\n---\n\n1. confirm: Continue?\n2. action: click "Submit"\n`,
    ok: true,
  },
  {
    label: "unknown step",
    source: `---\nsite: example.com\n---\n\n1. eval: x\n`,
    ok: false,
  },
  {
    label: "javascript scheme",
    source: `---\nsite: example.com\n---\n\n1. action: navigate to javascript:alert(1)\n`,
    ok: false,
  },
  {
    label: "undeclared secret",
    source: `---\nsite: example.com\n---\n\n1. confirm: ok?\n2. action: type {password} into "Password"\n`,
    ok: false,
  },
  {
    label: "missing confirm",
    source: `---\nsite: example.com\n---\n\n1. action: click "Submit"\n`,
    ok: false,
  },
  {
    label: "yaml alias bomb",
    source: `---\nsite: &s example.com\ntrigger: *s\n---\n\n1. extract: title\n`,
    ok: false,
  },
];

describe("packaged browser workflow contract cross-runtime parity", () => {
  it("loads the same canonical objects through CJS, ESM interop, and TypeScript adapters", async () => {
    const cjs = require(canonicalPath);
    const esm = await import(canonicalPath);
    const esmRoot = esm.default ?? esm;

    expect(parser.parseBrowserWorkflowMarkdown).toBe(canonical.parseBrowserWorkflowMarkdown);
    expect(parser.reparseTrustedBrowserWorkflowSource).toBe(
      canonical.reparseTrustedBrowserWorkflowSource,
    );
    expect(parser.assertRawBrowserWorkflowSource).toBe(canonical.assertRawBrowserWorkflowSource);
    expect(compiler.compileBrowserWorkflow).toBe(canonical.compileBrowserWorkflow);
    expect(compiler.compileBrowserWorkflowFromSource).toBe(
      canonical.compileBrowserWorkflowFromSource,
    );
    expect(stepPolicy.stepWrites).toBe(canonical.stepWrites);
    expect(stepPolicy.stepRetryable).toBe(canonical.stepRetryable);
    expect(stepPolicy.requiresPrecedingConfirm).toBe(canonical.requiresPrecedingConfirm);
    expect(schema.browserWorkflowAstSchema).toBe(canonical.browserWorkflowAstSchema);
    expect(schema.BrowserWorkflowError).toBe(canonical.BrowserWorkflowError);
    expect(schema.BROWSER_WORKFLOW_STEP_KINDS).toBe(canonical.BROWSER_WORKFLOW_STEP_KINDS);

    expect(esmRoot.BROWSER_WORKFLOW_STEP_KINDS).toEqual(cjs.BROWSER_WORKFLOW_STEP_KINDS);
    expect(esmRoot.BROWSER_WORKFLOW_ERROR_CODES).toEqual(cjs.BROWSER_WORKFLOW_ERROR_CODES);
    expect(canonical.parseBrowserWorkflowMarkdown(VALID)).toEqual(
      cjs.parseBrowserWorkflowMarkdown(VALID),
    );
    expect(esmRoot.parseBrowserWorkflowMarkdown(VALID)).toEqual(
      canonical.parseBrowserWorkflowMarkdown(VALID),
    );
  });

  it("parses and rejects every valid/invalid fixture identically across runtimes", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;
    const runtimes = [cjs, esm, parser];

    for (const runtime of runtimes) {
      const ast = runtime.parseBrowserWorkflowMarkdown(VALID);
      expect(ast.site).toBe("example.com");
      expect(ast.steps.map((step: { kind: string }) => step.kind)).toContain("goal");
      expect(() => runtime.parseBrowserWorkflowMarkdown(HOSTILE)).toThrow();
    }

    for (const testCase of INLINE_CASES) {
      for (const runtime of runtimes) {
        if (testCase.ok) {
          expect(runtime.parseBrowserWorkflowMarkdown(testCase.source).site).toBe("example.com");
        } else {
          expect(() => runtime.parseBrowserWorkflowMarkdown(testCase.source)).toThrow();
        }
      }
    }
  });

  it("compiles identically across CJS/TS and ignores forged compiled authority claims", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;
    const fromCjs = cjs.compileBrowserWorkflowFromSource(VALID);
    expect(esm.compileBrowserWorkflowFromSource(VALID)).toEqual(fromCjs);
    expect(compiler.compileBrowserWorkflowFromSource(VALID)).toEqual(fromCjs);
    expect(fromCjs.grantsAuthority).toBe(false);

    const forgedRecord = {
      source: VALID,
      compiled: { grantsAuthority: true, steps: [] },
      ast: { site: "forged.example", steps: [] },
    };
    const reparsed = canonical.reparseTrustedBrowserWorkflowSource(forgedRecord);
    expect(reparsed.site).toBe("example.com");
    const compiled = canonical.compileBrowserWorkflow(reparsed);
    expect(compiled.grantsAuthority).toBe(false);
  });

  it("keeps adapters thin and guards against duplicate vocabulary or schemas", () => {
    for (const relative of [
      "src/features/workflows/browser-workflow-schema.ts",
      "src/features/workflows/browser-workflow-parser.ts",
      "src/features/workflows/browser-workflow-compiler.ts",
      "src/features/workflows/browser-workflow-step-policy.ts",
    ]) {
      const source = readFileSync(path.resolve(relative), "utf8");
      expect(source).not.toMatch(/\bz\.(?:object|enum|literal|union|discriminatedUnion)\s*\(/);
      expect(source).not.toMatch(/BROWSER_WORKFLOW_STEP_KINDS\s*=\s*\[/);
      expect(source).not.toMatch(/BROWSER_WORKFLOW_ERROR_CODES\s*=\s*\[/);
      expect(source).toContain("browser-workflow-contract.cjs");
    }
  });
});
