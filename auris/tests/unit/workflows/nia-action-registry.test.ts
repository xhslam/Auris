import { describe, expect, it } from "vitest";

import {
  NIA_WORKFLOW_ACTION_ALLOWLIST,
  NIA_WORKFLOW_BUILTIN_USES,
  classifyNiaWorkflowUses,
  createNiaActionRegistry,
} from "@/features/workflows/nia-action-registry";
import { parseNiaWorkflowYaml } from "@/features/workflows/nia-workflow-runner";

describe("Nia workflow action registry", () => {
  it("contains the four pure Nia steps and only explicit action adapters", () => {
    const registry = createNiaActionRegistry({
      notify: () => undefined,
      "browser-act": () => undefined,
    });
    expect(registry.builtins()).toEqual([
      "nia/prompt",
      "nia/template",
      "nia/choose",
      "nia/transform",
    ]);
    expect(registry.list()).toEqual([...NIA_WORKFLOW_ACTION_ALLOWLIST]);
    expect(NIA_WORKFLOW_BUILTIN_USES).toHaveLength(4);
    expect(registry.has("shell")).toBe(false);
  });

  it("normalizes canonical and legacy definition references", () => {
    expect(classifyNiaWorkflowUses("nia/rewrite")).toMatchObject({
      kind: "definition",
      canonicalUses: "nia/rewrite",
      sourceCompatibility: "canonical",
    });
    expect(classifyNiaWorkflowUses("genie/rewrite")).toMatchObject({
      kind: "definition",
      canonicalUses: "nia/rewrite",
      sourceCompatibility: "legacy_genie",
    });
  });

  it("rejects unknown actions before any workflow execution", () => {
    expect(() => createNiaActionRegistry({ shell: () => undefined } as never)).toThrow(
      /non-allowlisted/u,
    );
    expect(() =>
      parseNiaWorkflowYaml(`name: hostile\nnia: v1\nsteps:\n  - id: pwn\n    uses: action/shell\n`),
    ).toThrow(/not allowlisted/u);
  });
});
