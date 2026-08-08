import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileBrowserWorkflow,
  compileBrowserWorkflowFromSource,
} from "@/features/workflows/browser-workflow-compiler";
import { parseBrowserWorkflowMarkdown } from "@/features/workflows/browser-workflow-parser";
import {
  requiresPrecedingConfirm,
  stepRetryable,
  stepWrites,
} from "@/features/workflows/browser-workflow-step-policy";
import { BrowserWorkflowError } from "@/features/workflows/browser-workflow-schema";

function fixture(name: string): string {
  return readFileSync(path.resolve("tests/fixtures/workflows", name), "utf8");
}

describe("compileBrowserWorkflow", () => {
  it("compiles typed intents, approval points, and page-target metadata without granting authority", () => {
    const source = fixture("browser-research.md");
    const ast = parseBrowserWorkflowMarkdown(source);
    const compiled = compileBrowserWorkflow(ast);

    expect(compiled.family).toBe("browser_markdown");
    expect(compiled.grantsAuthority).toBe(false);
    expect(compiled.expectedOrigin).toBe("https://example.com");
    expect(compiled.inputs).toEqual([
      { name: "query", type: "text", slot: "input:query" },
      { name: "apiToken", type: "secret", slot: "input:apiToken" },
    ]);

    const navigate = compiled.steps[0];
    expect(navigate).toMatchObject({
      kind: "action",
      intent: { action: "navigate", url: "https://example.com/search" },
      pageTarget: {
        expectedOrigin: "https://example.com",
        generationSemantics: "fresh_per_attempt",
        refSemantics: "generation_bound",
        operation: "navigate",
      },
    });

    const typeStep = compiled.steps[1];
    expect(typeStep).toMatchObject({
      kind: "action",
      intent: {
        action: "act",
        variant: "type",
        text: { kind: "input_slot", name: "query", type: "text" },
      },
    });

    const extract = compiled.steps[2];
    expect(extract).toMatchObject({
      kind: "extract",
      intent: { action: "read" },
      pageTarget: { operation: "read" },
    });

    const confirm = compiled.steps[3];
    expect(confirm).toMatchObject({
      kind: "confirm",
      intent: { type: "human_pause", message: "Submit the search results review?" },
      requiresApproval: true,
    });

    const click = compiled.steps[4];
    expect(click).toMatchObject({
      kind: "action",
      intent: { action: "act", variant: "click" },
      requiresApproval: true,
      pageTarget: { operation: "click" },
    });

    const goal = compiled.steps[5];
    expect(goal).toMatchObject({
      kind: "goal",
      intent: {
        type: "nia_proposal",
        bounded: true,
        requiresCompileReview: true,
      },
    });

    const api = compiled.steps[6];
    expect(api).toMatchObject({
      kind: "api",
      intent: {
        type: "guarded_api",
        method: "GET",
        url: "https://api.example.com/v1/search?q={query}",
        operation: "read",
        placeholder: true,
      },
    });

    expect(compiled.approvalPoints.length).toBeGreaterThan(0);
    expect(compiled.approvalPoints.some((point) => point.stepIndex === 4)).toBe(true);
    // Secret input names may appear as opaque slots; secret values must never appear.
    expect(JSON.stringify(compiled)).not.toMatch(/hunter2|Bearer |sk_live/u);
    expect(compiled.inputs.find((input) => input.name === "apiToken")).toEqual({
      name: "apiToken",
      type: "secret",
      slot: "input:apiToken",
    });
    expect(compileBrowserWorkflowFromSource(source)).toEqual(compiled);
  });

  it("keeps secret inputs as opaque slots and never embeds secret values", () => {
    const source = `---
site: example.com
inputs:
  password:
    type: secret
---

1. confirm: Fill the password field?
2. action: type {password} into "Password"
`;
    const compiled = compileBrowserWorkflowFromSource(source);
    const typeStep = compiled.steps[1];
    expect(typeStep).toMatchObject({
      kind: "action",
      intent: {
        action: "act",
        variant: "type",
        text: { kind: "input_slot", name: "password", type: "secret" },
      },
      secretSlots: ["input:password"],
    });
    expect(JSON.stringify(compiled)).not.toContain("hunter2");
    expect(JSON.stringify(compiled)).not.toMatch(/"password"\s*:\s*"/u);
  });

  it("maps step policy write/retry/confirm requirements", () => {
    const ast = parseBrowserWorkflowMarkdown(fixture("browser-research.md"));
    expect(stepWrites(ast.steps[2])).toBe(false); // extract
    expect(stepWrites(ast.steps[3])).toBe(false); // confirm
    expect(stepWrites(ast.steps[4])).toBe(true); // click action
    expect(stepRetryable(ast.steps[3])).toBe(false);
    expect(requiresPrecedingConfirm(ast.steps[4], ast)).toBe(true);
    expect(requiresPrecedingConfirm(ast.steps[0], ast)).toBe(false);
  });

  it("rejects compiling a forged AST that was not produced by the packaged parser", () => {
    expect(() =>
      compileBrowserWorkflow({
        family: "browser_markdown",
        site: "example.com",
        inputs: [],
        steps: [{ index: 1, kind: "action", text: "click Submit", line: 1 }],
      } as never),
    ).toThrow(BrowserWorkflowError);
  });
});
