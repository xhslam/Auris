"use strict";

const assert = require("node:assert/strict");

const { buildAllowlistedEnv } = require("../../electron/nia/nia-cli-provider.cjs");
const { createNiaWorkflowRuntime } = require("../../electron/workflows/nia-workflow-runtime.cjs");
const { createBrowserWorkflowRuntime } = require("../../electron/workflows/browser-workflow-runtime.cjs");
const { createWorkflowCapabilities } = require("../../electron/workflows/workflow-capabilities.cjs");

const NIA = `name: Local REST smoke\nnia: v1\nsteps:\n  - id: prompt\n    uses: nia/prompt\n    with:\n      definition: local-rest\n      input: ping\n`;
const BROWSER = `---\nsite: example.test\ninputs: {}\ntrigger: manual\n---\n\n1. extract: local fixture\n`;

async function waitFor(read, expected) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = read();
    if (state.status === expected) return state;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Smoke run did not reach ${expected}`);
}

async function main() {
  const capabilities = createWorkflowCapabilities();
  assert.equal(capabilities.snapshot().nia_yaml.start, false);
  assert.equal(capabilities.snapshot().browser_markdown.start, false);

  const safeCliEnv = buildAllowlistedEnv({ PATH: "/fixed/bin", HOME: "/safe/home", OPENAI_API_KEY: "hidden" });
  assert.equal(safeCliEnv.OPENAI_API_KEY, undefined);

  const nia = createNiaWorkflowRuntime({
    definitionRepository: { resolveUsesRef: async () => ({ body: "local deterministic REST" }) },
    executePrompt: async ({ input }) => ({ text: `local-rest:${input}` }),
    createRunId: () => "smoke-nia",
  });
  const niaStarted = await nia.startRun({ ownerId: "smoke:nia", request: { source: NIA } });
  const niaDone = await waitFor(() => nia.getRun({ runId: niaStarted.runId, ownerId: "smoke:nia" }), "completed");
  assert.equal(niaDone.outputs.prompt.text, "local-rest:ping");
  capabilities.markRuntimeVerified("nia_yaml");
  assert.equal(capabilities.snapshot().nia_yaml.start, true);
  assert.equal(capabilities.snapshot().browser_markdown.start, false);

  let lease = 0;
  const browser = createBrowserWorkflowRuntime({
    reviewDefinition: async () => true,
    dispatcher: {
      async dispatch({ params }) {
        if (params.request.action === "acquire_control") {
          return {
            control: { ...params.target, leaseToken: `smoke-lease-${++lease}` },
            target: { url: "https://example.test/local-fixture" },
          };
        }
        return { ok: true, fixture: "local-browser" };
      },
    },
  });
  const browserStarted = await browser.start({
    ownerId: "smoke:browser",
    request: { source: BROWSER, target: { windowId: "smoke-window", tabId: "smoke-tab" } },
  });
  await waitFor(() => browser.getState(browserStarted.runId, "smoke:browser"), "completed");
  capabilities.markRuntimeVerified("browser_markdown");
  assert.equal(capabilities.snapshot().browser_markdown.start, true);

  process.stdout.write(`${JSON.stringify({ ok: true, capabilities: capabilities.snapshot() })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
