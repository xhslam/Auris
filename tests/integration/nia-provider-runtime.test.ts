import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createNiaProviderRuntime,
} = require("../../electron/nia/nia-provider-runtime.cjs");

function createStore(provider: Record<string, unknown>) {
  return {
    getActiveProviderId: vi.fn(async () => provider.id),
    getProvider: vi.fn(async (id: string) => (id === provider.id ? provider : null)),
    resolveModelOverride: vi.fn(async ({ modelOverride }: { modelOverride?: string }) => ({
      model: modelOverride || provider.defaultModel,
    })),
    resolveRuntimeApiKey: vi.fn(async () => "sk-test-not-logged"),
  };
}

describe("Nia provider runtime integration", () => {
  it("streams a REST run through one deterministic owner-bound event protocol", async () => {
    const provider = {
      id: "rest-1",
      kind: "rest",
      protocol: "openai",
      enabled: true,
      defaultModel: "model-a",
      capabilities: { streaming: true },
    };
    const restProvider = {
      executePrompt: vi.fn(async ({ onDelta }: { onDelta: (text: string) => void }) => {
        onDelta("hel");
        onDelta("lo");
        return { text: "hello" };
      }),
    };
    const runtime = createNiaProviderRuntime({
      providerStore: createStore(provider),
      restProvider,
      cliProvider: { executePrompt: vi.fn() },
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.subscribe(10, (event: Record<string, unknown>) => events.push(event));

    const started = await runtime.startRun({ ownerWebContentsId: 10, prompt: "ping" });
    await vi.waitFor(() => expect(runtime.getRun({
      runId: started.runId,
      ownerWebContentsId: 10,
    }).status).toBe("completed"));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "delta",
      "delta",
      "completed",
    ]);
    expect(events.at(-1)?.text).toBe("hello");
    expect(JSON.stringify(events)).not.toContain("sk-test-not-logged");
    expect(() => runtime.getRun({ runId: started.runId, ownerWebContentsId: 11 }))
      .toThrow(/another renderer/u);
  });

  it("cancels once, discards late deltas, and isolates owners", async () => {
    const provider = {
      id: "rest-2",
      kind: "rest",
      protocol: "openai",
      enabled: true,
      defaultModel: "model-a",
      capabilities: { streaming: true },
    };
    let resolveRun!: (value: { text: string }) => void;
    const restProvider = {
      executePrompt: vi.fn(({ onDelta }: { onDelta: (text: string) => void }) =>
        new Promise<{ text: string }>((resolve) => {
          resolveRun = (value) => {
            onDelta("late");
            resolve(value);
          };
        })),
    };
    const runtime = createNiaProviderRuntime({
      providerStore: createStore(provider),
      restProvider,
      cliProvider: { executePrompt: vi.fn() },
    });
    const ownerEvents: Array<Record<string, unknown>> = [];
    const otherEvents: Array<Record<string, unknown>> = [];
    runtime.subscribe(20, (event: Record<string, unknown>) => ownerEvents.push(event));
    runtime.subscribe(21, (event: Record<string, unknown>) => otherEvents.push(event));

    const started = await runtime.startRun({ ownerWebContentsId: 20, prompt: "wait" });
    await vi.waitFor(() => expect(restProvider.executePrompt).toHaveBeenCalled());
    expect(() => runtime.cancelRun({ runId: started.runId, ownerWebContentsId: 21 }))
      .toThrow(/another renderer/u);
    runtime.cancelRun({ runId: started.runId, ownerWebContentsId: 20 });
    resolveRun({ text: "late" });
    await Promise.resolve();
    await Promise.resolve();

    expect(ownerEvents.map((event) => event.type)).toEqual(["started", "cancelled"]);
    expect(otherEvents).toEqual([]);
  });

  it("runs a host-owned browser tool loop with nia connection ownership", async () => {
    const provider = {
      id: "rest-tools",
      kind: "rest",
      protocol: "openai",
      enabled: true,
      defaultModel: "model-a",
      capabilities: { streaming: false },
    };
    const restProvider = {
      executePrompt: vi.fn(),
      executeChatTurn: vi.fn()
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [{
            id: "call-1",
            name: "auris_browser",
            arguments: { action: "read" },
          }],
        })
        .mockResolvedValueOnce({
          text: "Page title is Example",
          toolCalls: [],
        }),
    };
    const dispatch = vi.fn(async ({ connectionId, params }: {
      connectionId: string;
      params: { request: { action: string }; control?: { leaseToken: string } };
    }) => {
      expect(connectionId.startsWith("nia:")).toBe(true);
      if (params.request.action === "acquire_control") {
        return {
          control: {
            windowId: "w1",
            tabId: "t1",
            navigationGeneration: 1,
            controlEpoch: 1,
            leaseToken: "lease-secret",
          },
        };
      }
      if (params.request.action === "read") {
        expect(params.control?.leaseToken).toBe("lease-secret");
        return { markdown: "# Example" };
      }
      if (params.request.action === "release_control") return { released: true };
      throw new Error(`unexpected ${params.request.action}`);
    });
    const releaseOwnership = vi.fn();
    const runtime = createNiaProviderRuntime({
      providerStore: createStore(provider),
      restProvider,
      cliProvider: { executePrompt: vi.fn() },
      browserDispatcher: { dispatch, releaseOwnership },
      isBrowserAutomationAllowed: () => true,
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.subscribe(30, (event: Record<string, unknown>) => events.push(event));

    const started = await runtime.startRun({
      ownerWebContentsId: 30,
      prompt: "Read the page",
      enableBrowserTools: true,
      browserTarget: { windowId: "w1", tabId: "t1" },
    });
    await vi.waitFor(() => expect(runtime.getRun({
      runId: started.runId,
      ownerWebContentsId: 30,
    }).status).toBe("completed"));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "tool",
      "tool",
      "delta",
      "completed",
    ]);
    expect(events.at(-1)?.text).toBe("Page title is Example");
    expect(JSON.stringify(events)).not.toContain("lease-secret");
    expect(releaseOwnership).toHaveBeenCalledWith(`nia:${started.runId}`);
  });

  it("rejects browser tools when automation is disabled", async () => {
    const provider = {
      id: "rest-denied",
      kind: "rest",
      protocol: "openai",
      enabled: true,
      defaultModel: "model-a",
    };
    const runtime = createNiaProviderRuntime({
      providerStore: createStore(provider),
      restProvider: { executePrompt: vi.fn(), executeChatTurn: vi.fn() },
      cliProvider: { executePrompt: vi.fn() },
      browserDispatcher: { dispatch: vi.fn() },
      isBrowserAutomationAllowed: () => false,
    });
    await expect(runtime.startRun({
      ownerWebContentsId: 31,
      prompt: "Browse",
      enableBrowserTools: true,
    })).rejects.toMatchObject({ code: "BROWSER_TOOLS_UNAVAILABLE" });
  });
});
