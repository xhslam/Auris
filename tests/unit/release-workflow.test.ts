import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "release-desktop.yml");

describe("desktop release workflow", () => {
  it("validates the version tag, builds all supported desktop targets, and only publishes a verified draft", () => {
    const workflow = parse(fs.readFileSync(workflowPath, "utf8")) as {
      jobs: Record<string, { needs?: string[]; steps?: Array<{ name?: string; run?: string }> }>;
      on: { push: { tags: string[] } };
    };

    expect(workflow.on.push.tags).toContain("v*.*.*");
    expect(workflow.jobs["validate-release"].steps?.some((step) =>
      step.run?.includes("Tag $TAG is not newer than latest published release"),
    )).toBe(true);
    expect(workflow.jobs["build-and-upload"].steps?.some((step) =>
      step.name === "Verify updater metadata was produced for this version",
    )).toBe(true);
    expect(workflow.jobs["publish-release"].needs).toEqual([
      "validate-release",
      "build-and-upload",
    ]);
    expect(workflow.jobs["publish-release"].steps?.some((step) =>
      step.name === "Publish verified draft release" && step.run?.includes("--draft=false"),
    )).toBe(true);
  });
});
