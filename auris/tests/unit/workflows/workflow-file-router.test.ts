import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WorkflowFileRouteError,
  routeWorkflowFile,
} from "@/features/workflows/workflow-file-router";

const nia = readFileSync(resolve(process.cwd(), "tests/fixtures/workflows/nia-pipeline-v1.yaml"), "utf8");
const browser = readFileSync(resolve(process.cwd(), "tests/fixtures/workflows/browser-research.md"), "utf8");

describe("workflow file router", () => {
  it("routes YAML only to Nia and Markdown only to browser workflows", () => {
    expect(routeWorkflowFile({ fileName: "flow.yaml", source: nia }).family).toBe("nia_yaml");
    expect(routeWorkflowFile({ fileName: "flow.yml", source: nia }).family).toBe("nia_yaml");
    expect(routeWorkflowFile({ fileName: "research.md", source: browser }).family).toBe(
      "browser_markdown",
    );
  });

  it("rejects cross-renamed and mixed-family workflow sources", () => {
    for (const input of [
      { fileName: "nia.md", source: nia },
      { fileName: "browser.yaml", source: browser },
      {
        fileName: "mixed.yml",
        source: `---\nsite: https://example.com\ntrigger: manual\n---\n\n1. extract: title\n`,
      },
    ]) {
      expect(() => routeWorkflowFile(input)).toThrow(WorkflowFileRouteError);
      try {
        routeWorkflowFile(input);
      } catch (error) {
        expect((error as WorkflowFileRouteError).code).toBe("FAMILY_EXTENSION_MISMATCH");
      }
    }
  });

  it("rejects unsupported extensions and invalid family content", () => {
    expect(() => routeWorkflowFile({ fileName: "flow.txt", source: nia })).toThrow(
      /Unsupported workflow extension/u,
    );
    expect(() => routeWorkflowFile({ fileName: "flow.yaml", source: "name: broken" })).toThrow();
    expect(() => routeWorkflowFile({ fileName: "flow.md", source: "# not a workflow" })).toThrow();
  });
});
