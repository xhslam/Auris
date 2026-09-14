import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import canonicalContract from "../../../electron/shared/nia-workflow-contract.cjs";
import * as actionRegistry from "@/features/workflows/nia-action-registry";
import * as events from "@/features/workflows/nia-workflow-events";
import * as runner from "@/features/workflows/nia-workflow-runner";

const require = createRequire(import.meta.url);
const cjs = require("../../../electron/shared/nia-workflow-contract.cjs");
const canonical = readFileSync(
  resolve(process.cwd(), "tests/fixtures/workflows/nia-pipeline-v1.yaml"),
  "utf8",
);
const legacy = readFileSync(
  resolve(process.cwd(), "tests/fixtures/workflows/genie-pipeline-v1.yaml"),
  "utf8",
);

describe("packaged Nia workflow contract cross-runtime parity", () => {
  it("keeps CJS as the one parser/runner/registry/event implementation", async () => {
    const esm = await import("../../../electron/shared/nia-workflow-contract.cjs");
    const esmRoot = esm.default ?? esm;
    expect(runner.parseNiaWorkflowYaml).toBe(canonicalContract.parseNiaWorkflowYaml);
    expect(runner.runNiaWorkflow).toBe(canonicalContract.runNiaWorkflow);
    expect(actionRegistry.createNiaActionRegistry).toBe(canonicalContract.createNiaActionRegistry);
    expect(events.NIA_WORKFLOW_EVENT_TYPES).toBe(canonicalContract.NIA_WORKFLOW_EVENT_TYPES);
    expect(cjs.parseNiaWorkflowYaml(canonical)).toEqual(canonicalContract.parseNiaWorkflowYaml(canonical));
    expect(esmRoot.parseNiaWorkflowYaml(canonical)).toEqual(cjs.parseNiaWorkflowYaml(canonical));
    expect(esmRoot.parseNiaWorkflowYaml(legacy)).toEqual(cjs.parseNiaWorkflowYaml(legacy));
  });

  it("rejects forged renderer ASTs and ignores attached normalized fields", async () => {
    const parsed = cjs.parseNiaWorkflowYaml(canonical);
    await expect(cjs.runNiaWorkflow({ ast: { ...parsed, steps: [] } })).rejects.toMatchObject({
      code: "UNTRUSTED_AST",
    });
    const reparsed = cjs.reparseTrustedNiaWorkflowSource({
      source: canonical,
      family: "forged",
      outputs: { admin: true },
      payloadHash: "forged",
    });
    expect(reparsed.family).toBe("nia_yaml");
    expect(reparsed).not.toHaveProperty("payloadHash");
  });

  it("rejects hostile constructs identically through CJS and TS", () => {
    const invalid = [
      `name: alias\nnia: v1\nsteps: &steps\n  - uses: nia/template\n    with: { template: x }\ncopy: *steps\n`,
      `name: shell\nnia: v1\nsteps:\n  - uses: action/shell\n`,
      `name: mixed\nsite: https://example.com\ntrigger: manual\nsteps: []\n`,
    ];
    for (const source of invalid) {
      expect(() => cjs.parseNiaWorkflowYaml(source)).toThrow();
      expect(() => runner.parseNiaWorkflowYaml(source)).toThrow();
    }
  });
});
