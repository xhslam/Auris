import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "release-desktop.yml");

describe("desktop release workflow", () => {
  it("validates the version tag, builds all supported desktop targets, and only publishes a verified draft", () => {
    const workflow = parse(fs.readFileSync(workflowPath, "utf8")) as {
      jobs: Record<string, { needs?: string[]; steps?: Array<{ name?: string; run?: string }> }>;
      on: { push: { tags: string[] } };
    };

    const source = fs.readFileSync(workflowPath, "utf8");
    const builderSource = fs.readFileSync(path.join(repositoryRoot, "scripts", "build-desktop-release.cjs"), "utf8");
    expect(source).not.toContain("auris/package");
    expect(source).not.toContain("working-directory: auris");
    expect(source).toContain("node scripts/build-desktop-release.cjs");
    expect(builderSource).toContain("--config.forceCodeSigning=true");
    expect(builderSource).toContain("--config.mac.identity=-");
    expect(source).toContain("vars.MAC_SIGNING_MODE || 'adhoc'");
    expect(source).toContain("Signature=adhoc");
    expect(source).toContain("Automatic installation is unavailable");
    expect(source).toContain("gh release download");
    expect(source).toContain("verify-release-artifacts.cjs release-download");
    expect(source).toContain("npm run typecheck");
    expect(source).toContain("npm test");
    expect(source).toContain("GH_TOKEN:");
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
    expect(workflow.jobs["cleanup-aborted-release"]).toBeDefined();
    expect(workflow.jobs["cleanup-aborted-release"].steps?.some((step) =>
      step.name === "Delete incomplete draft release" && step.run?.includes("gh release delete"),
    )).toBe(true);
  });
  it("allows explicit ad-hoc releases and fails closed for missing Developer ID credentials", () => {
    const workflow = parse(fs.readFileSync(workflowPath, "utf8"));
    const script = workflow.jobs["validate-release"].steps.find(
      (step: { name?: string }) => step.name === "Validate macOS signing mode",
    ).run;
    for (const [mode, certificate, password, expectedStatus] of [
      ["adhoc", "", "", 0],
      ["developer-id", "", "", 1],
      ["developer-id", "p12", "", 1],
      ["developer-id", "p12", "password", 0],
      ["typo", "", "", 1],
    ] as const) {
      const result = spawnSync("bash", ["-c", script], {
        env: { ...process.env, MAC_SIGNING_MODE: mode, CSC_LINK: certificate, CSC_KEY_PASSWORD: password },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(expectedStatus);
    }
  });

});
