/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRuntime } = require("../../../../electron/workflows/browser-workflow-runtime.cjs");

const SOURCE = `---
site: example.com
inputs: {}
trigger: manual
---

1. extract: page summary
2. action: navigate to https://example.com/next
`;

async function eventually(read: () => unknown, expected: string) {
  for (let index = 0; index < 30; index += 1) {
    const value = read() as { status?: string };
    if (value?.status === expected) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Did not reach ${expected}`);
}

describe("browser workflow runtime", () => {
  it("reparses raw Markdown, requires an explicit target, and reacquires/releases per step", async () => {
    const calls: Array<Record<string, any>> = [];
    const dispatcher = {
      dispatch: vi.fn(async ({ connectionId, params }: Record<string, any>) => {
        calls.push({ connectionId, params });
        if (params.request.action === "acquire_control") {
          return { control: { ...params.target, leaseToken: `lease-${calls.length}` }, target: { url: "https://example.com/" } };
        }
        return { ok: true };
      }),
    };
    const runtime = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => true });
    await expect(runtime.start({ ownerId: "notes:1", request: { source: SOURCE } })).rejects.toMatchObject({ code: "EXPLICIT_TARGET_REQUIRED" });
    await expect(runtime.start({
      ownerId: "notes:1",
      request: { source: SOURCE, target: { windowId: "w1", tabId: "t1" }, compiled: {} },
    })).rejects.toMatchObject({ code: "FORGED_COMPILED_INPUT" });
    const started = await runtime.start({
      ownerId: "notes:1",
      request: { source: SOURCE, target: { windowId: "w1", tabId: "t1" } },
    });
    await eventually(() => runtime.getState(started.runId, "notes:1"), "completed");
    expect(calls.filter((call) => call.params.request.action === "acquire_control")).toHaveLength(2);
    expect(calls.filter((call) => call.params.request.action === "release_control")).toHaveLength(2);
    expect(calls.every((call) => call.connectionId === "notes:1")).toBe(true);
  });

  it("requires first-run review and rejects cross-owner state/cancel", async () => {
    const dispatcher = { dispatch: vi.fn() };
    const denied = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => false });
    await expect(denied.start({
      ownerId: "browser:1",
      request: { source: SOURCE, target: { windowId: "w1", tabId: "t1" } },
    })).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });

    const runtime = createBrowserWorkflowRuntime({
      dispatcher: { dispatch: vi.fn(async ({ params }: Record<string, any>) => params.request.action === "acquire_control"
        ? { control: { ...params.target, leaseToken: "lease" }, target: { url: "https://example.com/" } }
        : { ok: true }) },
      reviewDefinition: async () => true,
    });
    const run = await runtime.start({ ownerId: "browser:1", request: { source: SOURCE, target: { windowId: "w1", tabId: "t1" } } });
    expect(() => runtime.getState(run.runId, "browser:2")).toThrow(/another owner/u);
    expect(() => runtime.cancel(run.runId, "browser:2")).toThrow(/another owner/u);
  });
});
