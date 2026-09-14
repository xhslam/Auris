import { describe, expect, it, vi } from "vitest";
import { createWorkflowBridge, getWorkflowBridge } from "@/features/workflows/workflow-bridge";

describe("workflow bridge", () => {
  it("exposes only the fixed workflow command surface and cleans subscriptions", async () => {
    const native = {
      invoke: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
        void command; void payload; return {};
      }),
      subscribe: vi.fn((listener: (event: never) => void) => { void listener; return true; }),
      unsubscribe: vi.fn((listener: (event: never) => void) => { void listener; return true; }),
    };
    const bridge = createWorkflowBridge(native);
    await bridge.validate("browser_markdown", "source");
    await bridge.start("browser_markdown", { source: "source" });
    expect(native.invoke.mock.calls.map((call) => call[0])).toEqual(["validate", "start"]);
    const listener = vi.fn();
    const off = bridge.subscribe(listener);
    off();
    expect(native.unsubscribe).toHaveBeenCalledWith(listener);
    expect(getWorkflowBridge({ shadowingDesktop: { workflows: native } })).not.toBeNull();
  });
});
