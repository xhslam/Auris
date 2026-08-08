import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertUniqueDefinitionIds,
  parseNiaDefinitionMarkdown,
  reparseTrustedSource,
  serializeNiaDefinitionMarkdown,
} from "@/features/nia/nia-parser";
import { NiaDefinitionError } from "@/features/nia/nia-schema";
import { normalizeUsesRef, parseNiaStepRef } from "@/features/workflows/nia-workflow-schema";

function fixture(name: string): string {
  return readFileSync(path.resolve("tests/fixtures/nia", name), "utf8");
}

describe("parseNiaDefinitionMarkdown: accepted fixtures", () => {
  it("parses a canonical nia: v1 definition", () => {
    const ast = parseNiaDefinitionMarkdown(fixture("nia-v1.md"));
    expect(ast.version).toBe("v1");
    expect(ast.sourceCompatibility).toBe("canonical_v1");
    expect(ast.description).toBe("Improve clarity and flow");
    expect(ast.scope).toBe("selection");
    expect(ast.category).toBe("editing");
    expect(ast.model).toBe("gpt-4o");
    expect(ast.action).toBe("replace");
    expect(ast.context).toBe(1);
    expect(ast.approval).toBe("ask");
    expect(ast.input).toEqual({ type: "text", accept: "md", description: "Source selection" });
    expect(ast.output).toEqual({ type: "text", description: "Improved selection" });
    expect(ast.tags).toEqual(["editing", "clarity"]);
    expect(ast.body).toContain("You are an expert editor.");
    expect(ast.diagnostics).toBeUndefined();
  });

  it("normalizes a legacy genie: v1 definition", () => {
    const ast = parseNiaDefinitionMarkdown(fixture("genie-v1.md"));
    expect(ast.version).toBe("v1");
    expect(ast.sourceCompatibility).toBe("legacy_genie_v1");
    expect(ast.description).toBe("Improve clarity and flow");
    expect(ast.scope).toBe("selection");
    expect(ast.category).toBe("editing");
    expect(ast.action).toBe("replace");
    expect(ast.input).toEqual({ type: "text", accept: "md" });
    expect(ast.tags).toEqual(["editing"]);
    expect(ast.diagnostics && ast.diagnostics.length > 0).toBe(true);
  });

  it("normalizes an unversioned legacy genie: v0 definition", () => {
    const ast = parseNiaDefinitionMarkdown(fixture("genie-v0.md"));
    expect(ast.version).toBe("v1");
    expect(ast.sourceCompatibility).toBe("legacy_genie_v0");
    expect(ast.description).toBe("Improve clarity and flow");
    expect(ast.scope).toBe("selection");
    expect(ast.category).toBe("editing");
    expect(ast.action).toBeUndefined();
    expect(ast.diagnostics && ast.diagnostics.length > 0).toBe(true);
  });

  it("serializes an imported genie definition to canonical nia: v1 only", () => {
    const ast = parseNiaDefinitionMarkdown(fixture("genie-v1.md"));
    const serialized = serializeNiaDefinitionMarkdown(ast);
    expect(serialized.startsWith("---\nnia: v1\n")).toBe(true);
    expect(serialized).not.toContain("genie:");
    expect(serialized).not.toContain("sourceCompatibility");
    expect(serialized).not.toContain("diagnostics");

    const reparsed = parseNiaDefinitionMarkdown(serialized);
    expect(reparsed.sourceCompatibility).toBe("canonical_v1");
    expect(reparsed.description).toBe(ast.description);
    expect(reparsed.scope).toBe(ast.scope);
    expect(reparsed.action).toBe(ast.action);
  });

  it("serializes a canonical definition without rewriting import source during parse", () => {
    const source = fixture("nia-v1.md");
    const ast = parseNiaDefinitionMarkdown(source);
    // Parsing never mutates or persists a rewritten form of the source.
    expect(fixture("nia-v1.md")).toBe(source);
    const serialized = serializeNiaDefinitionMarkdown(ast);
    const reparsed = parseNiaDefinitionMarkdown(serialized);
    expect(reparsed.sourceCompatibility).toBe("canonical_v1");
  });
});

describe("workflow step reference helpers", () => {
  it("normalizes a canonical nia/<name> reference", () => {
    const ref = normalizeUsesRef("nia/improve");
    expect(ref).toEqual({ family: "nia", name: "improve", sourceCompatibility: "canonical" });
  });

  it("normalizes a legacy genie/<name> reference to the nia family", () => {
    const ref = normalizeUsesRef("genie/improve");
    expect(ref).toEqual({ family: "nia", name: "improve", sourceCompatibility: "legacy_genie" });
  });

  it("parseNiaStepRef behaves identically to normalizeUsesRef", () => {
    expect(parseNiaStepRef("nia/improve")).toEqual(normalizeUsesRef("nia/improve"));
    expect(parseNiaStepRef("genie/improve")).toEqual(normalizeUsesRef("genie/improve"));
  });

  it("rejects step references with path traversal, unknown families, or malformed names", () => {
    expect(() => normalizeUsesRef("nia/../improve")).toThrow();
    expect(() => normalizeUsesRef("nia/../../etc/passwd")).toThrow();
    expect(() => normalizeUsesRef("acme/improve")).toThrow();
    expect(() => normalizeUsesRef("nia/")).toThrow();
    expect(() => normalizeUsesRef("nia")).toThrow();
    expect(() => normalizeUsesRef("nia//improve")).toThrow();
    expect(() => normalizeUsesRef("nia/Improve")).toThrow();
    expect(() => normalizeUsesRef(42 as unknown as string)).toThrow();
  });
});

describe("parseNiaDefinitionMarkdown: rejection cases", () => {
  const validFrontmatter = "description: Improve clarity and flow\nscope: selection\n";

  it("rejects conflicting nia + genie version keys", () => {
    const source = `---\nnia: v1\ngenie: v1\n${validFrontmatter}---\n\nBody text here.\n`;
    expect(() => parseNiaDefinitionMarkdown(source)).toThrow(NiaDefinitionError);
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("CONFLICTING_VERSION_KEYS");
    }
  });

  it("rejects unsupported nia version", () => {
    const source = `---\nnia: v2\n${validFrontmatter}---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("rejects unsupported genie version", () => {
    const source = `---\ngenie: v2\n${validFrontmatter}---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("rejects unknown top-level frontmatter keys", () => {
    const source = `---\nnia: v1\n${validFrontmatter}unknownField: whatever\n---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("INVALID_DEFINITION_SHAPE");
    }
  });

  it("rejects a merge key masquerading as an unknown field", () => {
    const source = `---\nnia: v1\n${validFrontmatter}<<: { description: forged }\n---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("INVALID_DEFINITION_SHAPE");
    }
  });

  it("rejects documents over the size limit", () => {
    const source = `---\nnia: v1\ndescription: Improve clarity and flow\nscope: selection\n---\n\n${"x".repeat(
      300 * 1024,
    )}\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("SOURCE_TOO_LARGE");
    }
  });

  it("rejects YAML aliases (bomb-style expansion prevention)", () => {
    const source =
      "---\nnia: v1\ndescription: &d Improve clarity and flow\nscope: selection\ncategory: *d\n---\n\nBody text here.\n";
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("FRONTMATTER_UNSAFE_YAML");
    }
  });

  it("rejects deeply nested recursive structures", () => {
    let nestedValue = '"leaf"';
    for (let index = 0; index < 16; index += 1) {
      nestedValue = `[${nestedValue}]`;
    }
    const source = `---\nnia: v1\ndescription: Improve clarity and flow\nscope: selection\ndeeply: ${nestedValue}\n---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("STRUCTURE_TOO_DEEP");
    }
  });

  it("rejects path traversal in the id field", () => {
    const source = `---\nnia: v1\nid: "../../etc/passwd"\ndescription: Improve clarity and flow\nscope: selection\n---\n\nBody text here.\n`;
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("INVALID_DEFINITION_SHAPE");
    }
  });

  it("rejects path traversal in category/tag fields", () => {
    const source = `---\nnia: v1\ndescription: Improve clarity and flow\nscope: selection\ncategory: "../secrets"\n---\n\nBody text here.\n`;
    expect(() => parseNiaDefinitionMarkdown(source)).toThrow(NiaDefinitionError);
  });

  it("rejects a missing frontmatter block", () => {
    try {
      parseNiaDefinitionMarkdown("# No frontmatter here\n\nJust body text.\n");
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("FRONTMATTER_REQUIRED");
    }
  });

  it("rejects legacy v0 definitions missing description or scope", () => {
    const source = "---\ncategory: editing\n---\n\nBody text here.\n";
    try {
      parseNiaDefinitionMarkdown(source);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("INVALID_DEFINITION_SHAPE");
    }
  });

  it("rejects a non-string source", () => {
    try {
      parseNiaDefinitionMarkdown({ nia: "v1" } as unknown as string);
      throw new Error("expected parseNiaDefinitionMarkdown to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("SOURCE_NOT_RAW_MARKDOWN");
    }
  });

  it("rejects duplicate definition ids across a batch", () => {
    const one = parseNiaDefinitionMarkdown(
      `---\nnia: v1\nid: improve-text\ndescription: Improve clarity and flow\nscope: selection\n---\n\nBody one.\n`,
    );
    const two = parseNiaDefinitionMarkdown(
      `---\nnia: v1\nid: improve-text\ndescription: A different description\nscope: document\n---\n\nBody two.\n`,
    );
    expect(() => assertUniqueDefinitionIds([one, two])).toThrow(NiaDefinitionError);
    try {
      assertUniqueDefinitionIds([one, two]);
      throw new Error("expected assertUniqueDefinitionIds to throw");
    } catch (error) {
      expect((error as InstanceType<typeof NiaDefinitionError>).code).toBe("DUPLICATE_DEFINITION_ID");
    }
  });

  it("accepts distinct definition ids across a batch", () => {
    const one = parseNiaDefinitionMarkdown(
      `---\nnia: v1\nid: improve-text\ndescription: Improve clarity and flow\nscope: selection\n---\n\nBody one.\n`,
    );
    const two = parseNiaDefinitionMarkdown(
      `---\nnia: v1\nid: summarize-text\ndescription: Summarize the selection\nscope: selection\n---\n\nBody two.\n`,
    );
    expect(assertUniqueDefinitionIds([one, two])).toBe(true);
  });
});

describe("reparseTrustedSource", () => {
  it("reparses a raw string identically to parseNiaDefinitionMarkdown", () => {
    const source = fixture("nia-v1.md");
    expect(reparseTrustedSource(source)).toEqual(parseNiaDefinitionMarkdown(source));
  });

  it("reparses only the .source field and ignores a forged/attached ast", () => {
    const source = fixture("genie-v1.md");
    const forged = {
      source,
      ast: {
        version: "v1",
        sourceCompatibility: "canonical_v1",
        description: "FORGED",
        scope: "document",
        body: "forged body",
      },
      sourceCompatibility: "canonical_v1",
    };
    const result = reparseTrustedSource(forged);
    expect(result.sourceCompatibility).toBe("legacy_genie_v1");
    expect(result.description).toBe("Improve clarity and flow");
    expect(result.scope).toBe("selection");
  });

  it("rejects a record without a raw string .source", () => {
    expect(() => reparseTrustedSource({ ast: { sourceCompatibility: "canonical_v1" } } as never)).toThrow(
      NiaDefinitionError,
    );
  });
});
