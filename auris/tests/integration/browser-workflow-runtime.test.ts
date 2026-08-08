/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRuntime } = require("../../electron/workflows/browser-workflow-runtime.cjs");

const SOURCE = `---
site: example.com
inputs: {}
trigger: manual
---

1. confirm: Allow click?
2. action: click "Continue"
3. extract: final page
`;

async function waitState(runtime: any, runId: string, ownerId: string, status: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = runtime.getState(runId, ownerId);
    if (state.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Workflow did not reach ${status}`);
}

describe("browser workflow runtime integration", () => {
  it("pauses for confirmation and exact Browser approval, reacquiring fresh control each attempt", async () => {
    let clickAttempts = 0;
    let lease = 0;
    const dispatcher = {
      dispatch: vi.fn(async ({ params }: Record<string, any>) => {
        if (params.request.action === "acquire_control") {
          lease += 1;
          return { control: { ...params.target, leaseToken: `lease-${lease}` }, target: { url: "https://example.com/" } };
        }
        if (params.request.action === "act") {
          clickAttempts += 1;
          if (!params.approvalId) {
            const error = Object.assign(new Error("approval"), {
              code: "APPROVAL_REQUIRED",
              metadata: { approvalId: "approval-fresh" },
            });
            throw error;
          }
          expect(params.approvalId).toBe("approval-fresh");
        }
        return { ok: true };
      }),
    };
    const runtime = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => true });
    const started = await runtime.start({
      ownerId: "browser-chrome:8",
      request: { source: SOURCE, target: { windowId: "window-1", tabId: "tab-1" } },
    });
    await waitState(runtime, started.runId, "browser-chrome:8", "awaiting_confirmation");
    runtime.resume(started.runId, "browser-chrome:8", { approved: true });
    const approval = await waitState(runtime, started.runId, "browser-chrome:8", "awaiting_approval");
    expect(approval.pending.approvalId).toBe("approval-fresh");
    expect(() => runtime.resume(started.runId, "browser-chrome:8", { approved: true, approvalId: "old" }))
      .toThrow(/Fresh approval/u);
    runtime.resume(started.runId, "browser-chrome:8", { approved: true, approvalId: "approval-fresh" });
    await waitState(runtime, started.runId, "browser-chrome:8", "completed");
    expect(clickAttempts).toBe(2);
    expect(lease).toBe(3);
  });

  it("parks goal steps on niaPropose review and resumes after approval", async () => {
    const dispatcher = {
      dispatch: vi.fn(async ({ params }: Record<string, any>) => {
        if (params.request.action === "acquire_control") {
          return {
            control: { ...params.target, leaseToken: "lease-goal" },
            target: { url: "https://example.com/" },
          };
        }
        return { ok: true, markdown: "# done" };
      }),
    };
    const niaPropose = vi.fn(async ({ prompt }: { prompt: string }) => Object.freeze({
      kind: "nia_compile_proposal",
      text: `Reviewed: ${prompt}`,
    }));
    const runtime = createBrowserWorkflowRuntime({
      dispatcher,
      niaPropose,
      reviewDefinition: async () => true,
    });
    const source = `---
site: example.com
inputs: {}
trigger: manual
---

1. goal: Find the search box
2. extract: result
`;
    const started = await runtime.start({
      ownerId: "browser-chrome:9",
      request: { source, target: { windowId: "window-1", tabId: "tab-1" } },
    });
    const paused = await waitState(runtime, started.runId, "browser-chrome:9", "awaiting_confirmation");
    expect(paused.pending).toMatchObject({
      kind: "nia_review",
      proposal: { kind: "nia_compile_proposal", text: "Reviewed: Find the search box" },
    });
    expect(niaPropose).toHaveBeenCalledOnce();
    runtime.resume(started.runId, "browser-chrome:9", { approved: true });
    await waitState(runtime, started.runId, "browser-chrome:9", "completed");
  });
});
