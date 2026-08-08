import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createNiaDefinitionStore } = require("../../electron/nia/nia-definition-store.cjs");
const { buildAllowlistedEnv } = require("../../electron/nia/nia-cli-provider.cjs");
const { runNiaWorkflow } = require("../../electron/shared/nia-workflow-contract.cjs");

const fixture = (name: string) => readFileSync(resolve("tests/fixtures/nia", name), "utf8");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Nia and legacy Genie compatibility", () => {
  it.each([
    ["nia-v1.md", "canonical_v1"],
    ["genie-v1.md", "legacy_genie_v1"],
    ["genie-v0.md", "legacy_genie_v0"],
  ])("imports, executes, and canonically exports %s", async (filename, compatibility) => {
    const baseDir = await mkdtemp(join(tmpdir(), "auris-nia-compat-"));
    tempRoots.push(baseDir);
    const store = createNiaDefinitionStore({ baseDir });
    const installed = await store.install(fixture(filename), { filenameHint: "improve-text.md" });
    expect(installed).toMatchObject({ canonicalId: "improve-text", sourceCompatibility: compatibility });

    const source = `name: Compatibility\nnia: v1\ninputs:\n  text:\n    type: text\nsteps:\n  - id: improve\n    uses: nia/improve-text\n    with:\n      input: "{text}"\n`;
    const result = await runNiaWorkflow({
      source,
      inputs: { text: "rough" },
      adapters: {
        resolveDefinition: ({ uses }: { uses: string }) => store.resolveUsesRef(uses),
        executePrompt: async ({ input }: { input: string }) => ({ text: `normalized:${input}` }),
      },
    });
    expect(result.ok).toBe(true);
    expect(result.outputs.improve.text).toBe("normalized:rough");

    const canonical = await store.exportCanonical("improve-text");
    expect(canonical).toMatch(/^---\nnia: v1\n/u);
    expect(canonical).not.toContain("genie:");
    const canonicalStore = createNiaDefinitionStore({ baseDir: `${baseDir}-canonical` });
    tempRoots.push(`${baseDir}-canonical`);
    const reimported = await canonicalStore.install(canonical, { filenameHint: "improve-text.md" });
    expect(reimported.sourceCompatibility).toBe("canonical_v1");
  });

  it("does not expose workspace secrets to a CLI provider environment", () => {
    const env = buildAllowlistedEnv({
      PATH: "/fixed/bin",
      HOME: "/safe/home",
      AURIS_WORKSPACE: process.cwd(),
      OPENAI_API_KEY: "must-not-leak",
      npm_config_user_agent: "must-not-leak",
    });
    expect(env).toEqual(expect.objectContaining({ PATH: "/fixed/bin", HOME: "/safe/home" }));
    expect(env).not.toHaveProperty("AURIS_WORKSPACE");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(env).not.toHaveProperty("npm_config_user_agent");
    expect(JSON.stringify(env)).not.toContain(process.cwd());
  });
});
