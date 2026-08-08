import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import canonical from "../../../electron/shared/nia-definition-contract.cjs";
import * as nia from "../../../src/features/nia/nia-parser";
import * as niaSchema from "../../../src/features/nia/nia-schema";
import * as workflowSchema from "../../../src/features/workflows/nia-workflow-schema";

const require = createRequire(import.meta.url);
const canonicalPath = path.resolve("electron/shared/nia-definition-contract.cjs");

const NIA_V1_FIXTURE = `---
nia: v1
description: Improve clarity and flow
scope: selection
category: editing
model: gpt-4o
action: replace
context: 1
approval: ask
input:
  type: text
  accept: md
  description: Source selection
output:
  type: text
  description: Improved selection
tags:
  - editing
  - clarity
---

You are an expert editor. Improve the clarity, flow, and conciseness
of the following text while preserving the author's voice and intent.

Return only the improved text — no explanations.

{{content}}
`;

describe("packaged Nia definition contract cross-runtime parity", () => {
  it("loads the same canonical objects through CJS, ESM interop, and TypeScript adapters", async () => {
    const cjs = require(canonicalPath);
    const esm = await import(canonicalPath);
    const esmRoot = esm.default ?? esm;

    // Thin TS adapters must re-export the exact objects from the Vitest-resolved
    // canonical module (same evaluation graph as `import …/nia-definition-contract.cjs`).
    expect(nia.parseNiaDefinitionMarkdown).toBe(canonical.parseNiaDefinitionMarkdown);
    expect(nia.reparseTrustedSource).toBe(canonical.reparseTrustedSource);
    expect(nia.serializeNiaDefinitionMarkdown).toBe(canonical.serializeNiaDefinitionMarkdown);
    expect(nia.assertUniqueDefinitionIds).toBe(canonical.assertUniqueDefinitionIds);
    expect(nia.assertRawDefinitionSource).toBe(canonical.assertRawDefinitionSource);
    expect(niaSchema.niaDefinitionAstSchema).toBe(canonical.niaDefinitionAstSchema);
    expect(niaSchema.NIA_SOURCE_COMPATIBILITY).toBe(canonical.NIA_SOURCE_COMPATIBILITY);
    expect(niaSchema.NiaDefinitionError).toBe(canonical.NiaDefinitionError);
    expect(workflowSchema.normalizeUsesRef).toBe(canonical.normalizeUsesRef);
    expect(workflowSchema.parseNiaStepRef).toBe(canonical.parseNiaStepRef);
    expect(workflowSchema.serializeUsesRef).toBe(canonical.serializeUsesRef);
    expect(workflowSchema.niaStepRefSchema).toBe(canonical.niaStepRefSchema);

    // Absolute-path require/import may be a second evaluation under Vitest's
    // transform pipeline; still require value equality and matching accept/reject.
    expect(esmRoot.NIA_SOURCE_COMPATIBILITY).toEqual(cjs.NIA_SOURCE_COMPATIBILITY);
    expect(esmRoot.NIA_DEFINITION_ERROR_CODES).toEqual(cjs.NIA_DEFINITION_ERROR_CODES);
    expect(canonical.NIA_SOURCE_COMPATIBILITY).toEqual(cjs.NIA_SOURCE_COMPATIBILITY);
    expect(canonical.NIA_DEFINITION_ERROR_CODES).toEqual(cjs.NIA_DEFINITION_ERROR_CODES);

    expect(cjs.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE)).toEqual(
      canonical.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE),
    );
    expect(esmRoot.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE)).toEqual(
      canonical.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE),
    );
    expect(() => cjs.parseNiaDefinitionMarkdown("no frontmatter")).toThrow();
    expect(() => esmRoot.parseNiaDefinitionMarkdown("no frontmatter")).toThrow();
    expect(() => canonical.parseNiaDefinitionMarkdown("no frontmatter")).toThrow();
  });

  it("round-trips fixtures and step references identically across every runtime", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;

    const fromCjs = cjs.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE);
    expect(esm.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE)).toEqual(fromCjs);
    expect(nia.parseNiaDefinitionMarkdown(NIA_V1_FIXTURE)).toEqual(fromCjs);

    const serializedFromCjs = cjs.serializeNiaDefinitionMarkdown(fromCjs);
    expect(esm.serializeNiaDefinitionMarkdown(fromCjs)).toBe(serializedFromCjs);
    expect(nia.serializeNiaDefinitionMarkdown(fromCjs)).toBe(serializedFromCjs);

    for (const ref of ["nia/improve", "genie/improve"]) {
      const fromCjsRef = cjs.normalizeUsesRef(ref);
      expect(esm.normalizeUsesRef(ref)).toEqual(fromCjsRef);
      expect(workflowSchema.normalizeUsesRef(ref)).toEqual(fromCjsRef);
    }
  });

  it("rejects altered vocabulary and forged step references in every runtime", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;
    for (const runtime of [cjs, esm, workflowSchema]) {
      expect(() => runtime.normalizeUsesRef("nia/../etc")).toThrow();
      expect(() => runtime.normalizeUsesRef("acme/foo")).toThrow();
    }
    for (const runtime of [cjs, esm, nia]) {
      expect(() => runtime.parseNiaDefinitionMarkdown("---\nnia: v2\ndescription: d\nscope: selection\n---\n\nbody\n")).toThrow();
    }
  });

  it("main-authority reparse ignores a forged/spoofed AST attached to a stored source reference", () => {
    const genieSource = readFileSync(path.resolve("tests/fixtures/nia/genie-v1.md"), "utf8");
    const forgedRecord = {
      source: genieSource,
      // A hostile renderer could attach any of these; reparseTrustedSource
      // must never read them — only `.source` is ever parsed.
      sourceCompatibility: "canonical_v1",
      ast: {
        version: "v1",
        sourceCompatibility: "canonical_v1",
        description: "FORGED BY RENDERER",
        scope: "document",
        body: "forged body",
      },
    };

    const cjsResult = canonical.reparseTrustedSource(forgedRecord);
    const tsResult = nia.reparseTrustedSource(forgedRecord as never);

    expect(cjsResult.sourceCompatibility).toBe("legacy_genie_v1");
    expect(cjsResult.description).not.toBe("FORGED BY RENDERER");
    expect(tsResult).toEqual(cjsResult);

    // A record with no raw string `.source` must be rejected outright, proving
    // the forged `.ast` alone can never satisfy the trust boundary.
    expect(() => canonical.reparseTrustedSource({ ast: forgedRecord.ast } as never)).toThrow(
      canonical.NiaDefinitionError,
    );
  });

  it("keeps adapters thin and guards against duplicate vocabulary, schemas, and constants", () => {
    for (const relative of [
      "src/features/nia/nia-schema.ts",
      "src/features/nia/nia-parser.ts",
      "src/features/workflows/nia-workflow-schema.ts",
    ]) {
      const source = readFileSync(path.resolve(relative), "utf8");
      expect(source).not.toMatch(/\bz\.(?:object|enum|literal|union|discriminatedUnion)\s*\(/);
      expect(source).not.toMatch(/NIA_SOURCE_COMPATIBILITY\s*=\s*\[/);
      expect(source).not.toMatch(/NIA_DEFINITION_ERROR_CODES\s*=\s*\[/);
      expect(source).toContain("nia-definition-contract.cjs");
    }
  });
});
