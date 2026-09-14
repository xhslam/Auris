/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

import { normalizeWorkflowToolInput } from "../../electron/mcp/workflow-tool-contract.mjs";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRuntime } = require("../../electron/workflows/browser-workflow-runtime.cjs");
const { createNiaWorkflowRuntime } = require("../../electron/workflows/nia-workflow-runtime.cjs");
const { createWorkflowCapabilities } = require("../../electron/workflows/workflow-capabilities.cjs");
const { createWorkflowFacade } = require("../../electron/workflows/workflow-facade.cjs");

const NIA_ACTION = `name: Browser action\nnia: v1\nsteps:\n  - id: browser\n    uses: action/browser-act\n    approval: ask\n    with:\n      command: read\n`;
const BROWSER_ACTION = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. confirm: Continue?\n2. action: click "Continue"\n3. extract: summary\n`;

async function waitFor(read: () => any, status: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = read();
    if (state.status === status) return state;
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
  }
  throw new Error(`Run did not reach ${status}`);
}

describe("real two-family workflow facade integration", () => {
  it("validates and runs stdio-shaped Nia and Browser requests with independent approvals", async () => {
    const liveLeases = new Set<string>();
    let lease = 0;
    let browserAttempts = 0;
    const dispatcher = {
      dispatch: vi.fn(async ({ params }: Record<string, any>) => {
        if (params.request.action === "acquire_control") {
          const leaseToken = `lease-${++lease}`;
          liveLeases.add(leaseToken);
          return { control: { ...params.target, leaseToken }, target: { url: "https://example.com/" } };
        }
        if (params.request.action === "release_control") {
          liveLeases.delete(params.control.leaseToken);
          return { released: true };
        }
        if (params.request.action === "act") {
          browserAttempts += 1;
          if (!params.approvalId) {
            throw Object.assign(new Error("approval"), {
              code: "APPROVAL_REQUIRED",
              metadata: { approvalId: `browser-approval-${browserAttempts}` },
            });
          }
        }
        return { ok: true };
      }),
    };
    const approvalService = { request: vi.fn(async () => true) };
    const niaAction = vi.fn(async () => ({ text: "browser action approved" }));
    const niaRuntime = createNiaWorkflowRuntime({
      approvalService,
      actionAdapters: { "browser-act": niaAction },
      createRunId: () => "nia-two-family",
    });
    const browserRuntime = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => true });
    const capabilities = createWorkflowCapabilities({ nia_yaml: "runtime_verified", browser_markdown: "runtime_verified" });
    const facade = createWorkflowFacade({ niaRuntime, browserRuntime, capabilities });

    expect(facade.validate("nia_yaml", NIA_ACTION)).toMatchObject({ family: "nia_yaml", stepCount: 1 });
    expect(facade.validate("browser_markdown", BROWSER_ACTION)).toMatchObject({ family: "browser_markdown", stepCount: 3 });

    const niaInput = normalizeWorkflowToolInput({ action: "start", family: "nia_yaml", source: NIA_ACTION });
    const nia = await facade.request({ ownerId: "stdio:nia", ...niaInput });
    const niaDone = await waitFor(() => facade.getState("stdio:nia", "nia_yaml", nia.runId), "completed");
    expect(niaDone).toMatchObject({ family: "nia_yaml", status: "completed" });
    expect(approvalService.request).toHaveBeenCalledWith(expect.objectContaining({ family: "nia_yaml" }));
    expect(niaAction).toHaveBeenCalledTimes(1);

    const browserInput = normalizeWorkflowToolInput({
      action: "start",
      family: "browser_markdown",
      source: BROWSER_ACTION,
      window_id: "window-1",
      tab_id: "tab-1",
    });
    const browser = await facade.request({ ownerId: "stdio:browser", ...browserInput });
    await waitFor(() => facade.getState("stdio:browser", "browser_markdown", browser.runId), "awaiting_confirmation");
    await facade.request({
      ownerId: "stdio:browser",
      action: "resume",
      family: "browser_markdown",
      runId: browser.runId,
      approved: true,
    });
    const pending = await waitFor(() => facade.getState("stdio:browser", "browser_markdown", browser.runId), "awaiting_approval");
    await facade.request({
      ownerId: "stdio:browser",
      action: "resume",
      family: "browser_markdown",
      runId: browser.runId,
      approved: true,
      approvalId: pending.pending.approvalId,
    });
    const browserDone = await waitFor(() => facade.getState("stdio:browser", "browser_markdown", browser.runId), "completed");
    expect(browserDone).toMatchObject({ family: "browser_markdown", status: "completed" });
    expect(liveLeases.size).toBe(0);
  });

  it("cancels both owner families on disconnect and releases the browser target", async () => {
    let resolvePrompt!: (value: { text: string }) => void;
    const niaRuntime = createNiaWorkflowRuntime({
      definitionRepository: { resolveUsesRef: async () => ({ body: "wait" }) },
      executePrompt: () => new Promise((resolvePromptRun) => { resolvePrompt = resolvePromptRun; }),
      createRunId: () => "nia-disconnect",
    });
    const dispatcher = {
      dispatch: vi.fn(async ({ params }: Record<string, any>) => params.request.action === "acquire_control"
        ? { control: { ...params.target, leaseToken: "lease" }, target: { url: "https://example.com/" } }
        : { ok: true }),
    };
    const browserRuntime = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => true });
    const facade = createWorkflowFacade({
      niaRuntime,
      browserRuntime,
      capabilities: createWorkflowCapabilities({ nia_yaml: "runtime_verified", browser_markdown: "runtime_verified" }),
    });
    const niaSource = `name: Wait\nnia: v1\nsteps:\n  - id: wait\n    uses: nia/prompt\n    with:\n      definition: wait\n`;
    const nia = await facade.start("shared-owner", "nia_yaml", { source: niaSource });
    const browser = await facade.start("shared-owner", "browser_markdown", {
      source: BROWSER_ACTION,
      target: { windowId: "window-shared", tabId: "tab-shared" },
    });
    await waitFor(() => facade.getState("shared-owner", "browser_markdown", browser.runId), "awaiting_confirmation");
    expect(facade.disconnect("shared-owner")).toEqual({ nia: 1, browser: 1 });
    expect(niaRuntime.getRun({ runId: nia.runId, ownerId: "shared-owner" }).status).toBe("cancelled");
    expect(browserRuntime.getState(browser.runId, "shared-owner").status).toBe("cancelled");

    const reclaimed = await browserRuntime.start({
      ownerId: "human-reclaim",
      request: { source: BROWSER_ACTION, target: { windowId: "window-shared", tabId: "tab-shared" } },
    });
    await waitFor(() => browserRuntime.getState(reclaimed.runId, "human-reclaim"), "awaiting_confirmation");
    browserRuntime.cancel(reclaimed.runId, "human-reclaim");
    resolvePrompt({ text: "late" });
    await Promise.resolve();
  });
});
