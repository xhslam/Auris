import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseBrowserWorkflowMarkdown,
  reparseTrustedBrowserWorkflowSource,
} from "@/features/workflows/browser-workflow-parser";
import { BrowserWorkflowError } from "@/features/workflows/browser-workflow-schema";

function fixture(name: string): string {
  return readFileSync(path.resolve("tests/fixtures/workflows", name), "utf8");
}

function expectCode(source: string, code: string) {
  try {
    parseBrowserWorkflowMarkdown(source);
    throw new Error(`expected parseBrowserWorkflowMarkdown to throw ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BrowserWorkflowError);
    expect((error as InstanceType<typeof BrowserWorkflowError>).code).toBe(code);
  }
}

describe("parseBrowserWorkflowMarkdown: accepted fixtures", () => {
  it("parses site, typed inputs, trigger, and all five step kinds", () => {
    const ast = parseBrowserWorkflowMarkdown(fixture("browser-research.md"));
    expect(ast.family).toBe("browser_markdown");
    expect(ast.site).toBe("example.com");
    expect(ast.trigger).toBe("manual");
    expect(ast.inputs).toEqual([
      { name: "query", type: "text", description: "Search query" },
      { name: "apiToken", type: "secret", description: "Opaque API credential slot" },
    ]);
    expect(ast.steps.map((step) => step.kind)).toEqual([
      "action",
      "action",
      "extract",
      "confirm",
      "action",
      "goal",
      "api",
    ]);
    expect(ast.steps[0]).toMatchObject({
      index: 1,
      kind: "action",
      text: "navigate to https://example.com/search",
    });
    expect(ast.steps[3]).toMatchObject({ kind: "confirm", text: "Submit the search results review?" });
    expect(ast.steps[6]).toMatchObject({
      kind: "api",
      text: "GET https://api.example.com/v1/search?q={query}",
    });
  });

  it("reparses a trusted source record and ignores forged AST attachments", () => {
    const source = fixture("browser-research.md");
    const forged = {
      source,
      family: "nia_yaml",
      site: "evil.example",
      ast: {
        family: "browser_markdown",
        site: "forged.example",
        inputs: [],
        steps: [{ index: 1, kind: "action", text: "click forged", line: 1 }],
      },
      compiled: { grantsAuthority: true },
    };

    const ast = reparseTrustedBrowserWorkflowSource(forged);
    expect(ast.site).toBe("example.com");
    expect(ast.site).not.toBe("forged.example");
    expect(ast.steps.length).toBeGreaterThan(1);

    expect(() => reparseTrustedBrowserWorkflowSource({ ast: forged.ast } as never)).toThrow(
      BrowserWorkflowError,
    );
  });
});

describe("parseBrowserWorkflowMarkdown: rejection cases", () => {
  it("rejects the hostile fixture for unknown frontmatter and unsafe steps", () => {
    expect(() => parseBrowserWorkflowMarkdown(fixture("browser-hostile.md"))).toThrow(
      BrowserWorkflowError,
    );
  });

  it("rejects an unknown step kind", () => {
    expectCode(
      `---\nsite: example.com\n---\n\n1. eval: doEvil()\n`,
      "UNKNOWN_STEP_KIND",
    );
  });

  it("rejects arbitrary JavaScript in an action step", () => {
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: execute_js window.alert(1)\n`,
      "ARBITRARY_JAVASCRIPT",
    );
  });

  it("rejects unsafe URL schemes", () => {
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: navigate to javascript:alert(1)\n`,
      "UNSAFE_SCHEME",
    );
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: navigate to file:///etc/passwd\n`,
      "UNSAFE_SCHEME",
    );
  });

  it("rejects unbounded loops and retries in frontmatter", () => {
    expectCode(
      `---\nsite: example.com\nmaxRetries: 999999\n---\n\n1. extract: title\n`,
      "INVALID_WORKFLOW_SHAPE",
    );
    expectCode(
      `---\nsite: example.com\nloop: forever\n---\n\n1. extract: title\n`,
      "INVALID_WORKFLOW_SHAPE",
    );
    expectCode(
      `---\nsite: example.com\n---\n\n1. while: true\n`,
      "UNBOUNDED_CONTROL_FLOW",
    );
  });

  it("rejects undeclared secret interpolation", () => {
    expectCode(
      `---\nsite: example.com\ninputs:\n  query:\n    type: text\n---\n\n1. action: type {password} into "Password"\n`,
      "UNDECLARED_SECRET",
    );
  });

  it("rejects undeclared non-secret variable interpolation", () => {
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: type {query} into "Search"\n`,
      "UNDECLARED_VARIABLE",
    );
  });

  it("rejects path traversal in site and selectors", () => {
    expectCode(
      `---\nsite: ../etc/passwd\n---\n\n1. extract: title\n`,
      "PATH_TRAVERSAL",
    );
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: click "../../etc/passwd"\n`,
      "PATH_TRAVERSAL",
    );
  });

  it("rejects YAML bombs / aliases and oversized structures", () => {
    expectCode(
      `---\nsite: &s example.com\ntrigger: *s\n---\n\n1. extract: title\n`,
      "FRONTMATTER_UNSAFE_YAML",
    );

    let nested = '"leaf"';
    for (let index = 0; index < 16; index += 1) nested = `[${nested}]`;
    expectCode(
      `---\nsite: example.com\ndeeply: ${nested}\n---\n\n1. extract: title\n`,
      "STRUCTURE_TOO_DEEP",
    );
  });

  it("rejects oversized selectors and payloads", () => {
    const hugeSelector = "a".repeat(600);
    const hugePayload = "a".repeat(2_500);
    expectCode(
      `---\nsite: example.com\n---\n\n1. confirm: Continue?\n2. action: click "${hugeSelector}"\n`,
      "SELECTOR_TOO_LARGE",
    );
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: type "${hugePayload}" into "Search"\n`,
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("rejects sensitive write actions missing a preceding confirm", () => {
    expectCode(
      `---\nsite: example.com\n---\n\n1. action: click "Submit"\n`,
      "CONFIRMATION_REQUIRED",
    );
    expectCode(
      `---\nsite: example.com\ninputs:\n  password:\n    type: secret\n---\n\n1. action: type {password} into "Password"\n`,
      "CONFIRMATION_REQUIRED",
    );
  });

  it("rejects mixing Nia YAML pipeline shape into a browser Markdown workflow", () => {
    expectCode(
      `---\nsite: example.com\nuses: nia/prompt\n---\n\n1. extract: title\n`,
      "INVALID_WORKFLOW_SHAPE",
    );
  });

  it("rejects missing site, empty steps, and non-raw sources", () => {
    expectCode(`---\ntrigger: manual\n---\n\n1. extract: title\n`, "MISSING_SITE");
    expectCode(`---\nsite: example.com\n---\n\n# only comments\n`, "NO_STEPS");
    try {
      parseBrowserWorkflowMarkdown({ site: "example.com" } as unknown as string);
      throw new Error("expected throw");
    } catch (error) {
      expect((error as InstanceType<typeof BrowserWorkflowError>).code).toBe(
        "SOURCE_NOT_RAW_MARKDOWN",
      );
    }
  });
});
