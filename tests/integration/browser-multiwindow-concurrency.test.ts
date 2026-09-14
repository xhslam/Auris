/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserLeaseManager } = require("../../electron/browser/browser-lease.cjs");
const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");
const { createBrowserWorkflowRuntime } = require("../../electron/workflows/browser-workflow-runtime.cjs");
const { createNiaWorkflowRuntime } = require("../../electron/workflows/nia-workflow-runtime.cjs");

const PAUSED = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. confirm: Continue?\n`;

async function waitFor(read: () => any, status: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = read();
    if (state.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Did not reach ${status}`);
}

describe("browser multi-window concurrency", () => {
  it("isolates two MCP owners on separate tabs and rejects a conflict on one tab", () => {
    let random = 0;
    const leases = createBrowserLeaseManager({ randomBytes: () => Buffer.alloc(32, ++random) });
    const registry = createBrowserRegistry();
    const firstWindow = registry.createWindow();
    const secondWindow = registry.createWindow();
    const firstTab = registry.createTab(firstWindow.windowId);
    const secondTab = registry.createTab(secondWindow.windowId);
    leases.acquire({ connectionId: "mcp-one", controlEpoch: 0, navigationGeneration: 0, windowId: firstWindow.windowId, tabId: firstTab.tabId });
    leases.acquire({ connectionId: "mcp-two", controlEpoch: 0, navigationGeneration: 0, windowId: secondWindow.windowId, tabId: secondTab.tabId });
    expect(leases.snapshot().leases).toHaveLength(2);
    expect(() => leases.acquire({ connectionId: "mcp-conflict", controlEpoch: 0, navigationGeneration: 0, windowId: firstWindow.windowId, tabId: firstTab.tabId })).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
    leases.releaseConnection("mcp-one");
    leases.releaseConnection("mcp-two");
    expect(leases.snapshot().leases).toHaveLength(0);
  });

  it("runs MCP/workflow targets on separate windows and isolates workflow conflicts", async () => {
    const dispatcher = { dispatch: vi.fn(async ({ params }: Record<string, any>) => params.request.action === "acquire_control"
      ? { control: { ...params.target, leaseToken: `lease-${params.target.windowId}` }, target: { url: "https://example.com/" } }
      : { ok: true }) };
    const runtime = createBrowserWorkflowRuntime({ dispatcher, reviewDefinition: async () => true });
    const first = await runtime.start({ ownerId: "workflow-one", request: { source: PAUSED, target: { windowId: "window-1", tabId: "tab-1" } } });
    const second = await runtime.start({ ownerId: "workflow-two", request: { source: PAUSED, target: { windowId: "window-2", tabId: "tab-2" } } });
    await waitFor(() => runtime.getState(first.runId, "workflow-one"), "awaiting_confirmation");
    await waitFor(() => runtime.getState(second.runId, "workflow-two"), "awaiting_confirmation");
    await expect(runtime.start({ ownerId: "workflow-conflict", request: { source: PAUSED, target: { windowId: "window-1", tabId: "tab-1" } } })).rejects.toMatchObject({ code: "TARGET_BUSY" });
    expect(runtime.disconnect("workflow-one")).toBe(1);
    expect(runtime.disconnect("workflow-two")).toBe(1);
  });

  it("runs two Nia owners independently", async () => {
    let id = 0;
    const runtime = createNiaWorkflowRuntime({ createRunId: () => `nia-concurrent-${++id}` });
    const source = `name: Concurrent\nnia: v1\nsteps:\n  - id: done\n    uses: nia/template\n    with:\n      template: ok\n`;
    const first = await runtime.startRun({ ownerId: "nia-one", request: { source } });
    const second = await runtime.startRun({ ownerId: "nia-two", request: { source } });
    const [firstDone, secondDone] = await Promise.all([
      waitFor(() => runtime.getRun({ runId: first.runId, ownerId: "nia-one" }), "completed"),
      waitFor(() => runtime.getRun({ runId: second.runId, ownerId: "nia-two" }), "completed"),
    ]);
    expect(firstDone.outputs.done.text).toBe("ok");
    expect(secondDone.outputs.done.text).toBe("ok");
    expect(() => runtime.getRun({ runId: first.runId, ownerId: "nia-two" })).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
  });
});
