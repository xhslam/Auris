import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createWorkflowCapabilities } = require("../../../../electron/workflows/workflow-capabilities.cjs");
const { createWorkflowFacade } = require("../../../../electron/workflows/workflow-facade.cjs");

const NIA = `name: Demo\nnia: v1\ninputs: {}\nsteps:\n  - id: one\n    uses: nia/template\n    with:\n      template: hello\n      input: world\n`;
const BROWSER = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. extract: summary\n`;

describe("workflow facade", () => {
  it("routes both families and enforces owner/family on state and cancel", async () => {
    const capabilities = createWorkflowCapabilities({ nia_yaml: "runtime_verified", browser_markdown: "runtime_verified" });
    const niaRuntime = {
      startRun: vi.fn(async () => ({ runId: "nia-1", status: "running" })),
      getRun: vi.fn(() => ({ runId: "nia-1", status: "completed" })),
      cancelRun: vi.fn(() => ({ runId: "nia-1", status: "cancelled" })),
      cancelAllForOwner: vi.fn(() => 0),
      subscribe: vi.fn(() => vi.fn()),
    };
    const browserRuntime = {
      start: vi.fn(async () => ({ runId: "browser-1", status: "running" })),
      getState: vi.fn(() => ({ runId: "browser-1", status: "completed" })),
      cancel: vi.fn(() => ({ runId: "browser-1", status: "cancelled" })),
      disconnect: vi.fn(() => 0),
      subscribe: vi.fn(() => vi.fn()),
    };
    const facade = createWorkflowFacade({ browserRuntime, niaRuntime, capabilities });
    expect(facade.validate("nia_yaml", NIA).family).toBe("nia_yaml");
    expect(facade.validate("browser_markdown", BROWSER).family).toBe("browser_markdown");
    const nia = await facade.start("mcp:1", "nia_yaml", { source: NIA });
    const browser = await facade.start("mcp:1", "browser_markdown", { source: BROWSER, target: { windowId: "w", tabId: "t" } });
    expect(nia.family).toBe("nia_yaml");
    expect(browser.family).toBe("browser_markdown");
    expect(() => facade.getState("mcp:2", "nia_yaml", nia.runId)).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
    expect(() => facade.cancel("mcp:1", "nia_yaml", browser.runId)).toThrowError(expect.objectContaining({ code: "FAMILY_MISMATCH" }));
    facade.disconnect("mcp:1");
    expect(niaRuntime.cancelAllForOwner).toHaveBeenCalledWith("mcp:1");
    expect(browserRuntime.disconnect).toHaveBeenCalledWith("mcp:1");
  });
});
