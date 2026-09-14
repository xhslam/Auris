import { describe, expect, it } from "vitest";

import {
  BUILT_IN_NIA_DEFINITIONS,
  parseBuiltInNiaDefinition,
} from "@/features/nia/built-in-definitions";
import {
  describeNiaDefinitionUsesRef,
  findNiaDefinitionByCanonicalId,
  groupNiaDefinitionsByProvenance,
  niaDefinitionDisplayLabel,
  normalizeNiaDefinitionLookupName,
  sortNiaDefinitionRecords,
  type NiaDefinitionRecord,
} from "@/features/nia/nia-definition-registry";

function record(overrides: Partial<NiaDefinitionRecord> & { canonicalId: string }): NiaDefinitionRecord {
  return {
    label: "Nia",
    provenance: "built-in",
    sourceCompatibility: "canonical_v1",
    description: "A definition",
    scope: "selection",
    body: "Body text",
    ...overrides,
  };
}

describe("built-in Nia definitions", () => {
  it("ships at least one immutable built-in definition", () => {
    expect(BUILT_IN_NIA_DEFINITIONS.length).toBeGreaterThanOrEqual(1);
    expect(Object.isFrozen(BUILT_IN_NIA_DEFINITIONS)).toBe(true);
    for (const entry of BUILT_IN_NIA_DEFINITIONS) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it("parses every built-in through the packaged contract as canonical nia: v1", () => {
    for (const entry of BUILT_IN_NIA_DEFINITIONS) {
      const ast = parseBuiltInNiaDefinition(entry);
      expect(ast.sourceCompatibility).toBe("canonical_v1");
      expect(ast.id).toBe(entry.name);
      expect(ast.description.length).toBeGreaterThan(0);
    }
  });

  it("has unique built-in names", () => {
    const names = BUILT_IN_NIA_DEFINITIONS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("normalizeNiaDefinitionLookupName", () => {
  it("casefolds and Unicode-normalizes names to the same identity", () => {
    expect(normalizeNiaDefinitionLookupName("Improve-Text")).toBe("improve-text");
    // "café" precomposed (U+00E9) vs. decomposed (e + U+0301) must collide.
    const precomposed = "caf\u00e9";
    const decomposed = "cafe\u0301";
    expect(normalizeNiaDefinitionLookupName(precomposed)).toBe(
      normalizeNiaDefinitionLookupName(decomposed),
    );
  });

  it("rejects empty or non-string input", () => {
    expect(() => normalizeNiaDefinitionLookupName("")).toThrow(TypeError);
    expect(() => normalizeNiaDefinitionLookupName(undefined as unknown as string)).toThrow(TypeError);
  });
});

describe("sortNiaDefinitionRecords", () => {
  it("sorts by canonicalId without mutating the input", () => {
    const input = [record({ canonicalId: "zeta" }), record({ canonicalId: "alpha" })];
    const sorted = sortNiaDefinitionRecords(input);
    expect(sorted.map((entry) => entry.canonicalId)).toEqual(["alpha", "zeta"]);
    expect(input.map((entry) => entry.canonicalId)).toEqual(["zeta", "alpha"]);
  });
});

describe("findNiaDefinitionByCanonicalId", () => {
  it("finds a record regardless of case/Unicode normalization differences", () => {
    const records = [record({ canonicalId: "improve-text" })];
    expect(findNiaDefinitionByCanonicalId(records, "Improve-Text")).toBe(records[0]);
    expect(findNiaDefinitionByCanonicalId(records, "IMPROVE-TEXT")).toBe(records[0]);
  });

  it("returns undefined when no record matches", () => {
    const records = [record({ canonicalId: "improve-text" })];
    expect(findNiaDefinitionByCanonicalId(records, "unknown")).toBeUndefined();
  });
});

describe("groupNiaDefinitionsByProvenance", () => {
  it("splits built-in and installed records", () => {
    const records = [
      record({ canonicalId: "a", provenance: "built-in" }),
      record({ canonicalId: "b", provenance: "installed" }),
      record({ canonicalId: "c", provenance: "installed" }),
    ];
    const grouped = groupNiaDefinitionsByProvenance(records);
    expect(grouped.builtIn.map((entry) => entry.canonicalId)).toEqual(["a"]);
    expect(grouped.installed.map((entry) => entry.canonicalId)).toEqual(["b", "c"]);
  });
});

describe("niaDefinitionDisplayLabel", () => {
  it("always displays Nia regardless of legacy source compatibility", () => {
    expect(niaDefinitionDisplayLabel()).toBe("Nia");
  });
});

describe("describeNiaDefinitionUsesRef", () => {
  it("always renders a canonical nia/<name> reference, never genie/*", () => {
    expect(describeNiaDefinitionUsesRef({ family: "nia", name: "improve", sourceCompatibility: "canonical" } as never)).toBe(
      "nia/improve",
    );
    expect(
      describeNiaDefinitionUsesRef({ family: "nia", name: "improve", sourceCompatibility: "legacy_genie" } as never),
    ).toBe("nia/improve");
  });
});
