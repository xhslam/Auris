import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  resolveOwnerKindFromConnectionId,
  normalizeOwnerKind,
} = require("../../../../electron/browser/browser-owner-kind.cjs");
const { createBrowserLeaseManager } = require(
  "../../../../electron/browser/browser-lease.cjs",
);
const {
  createNiaBrowserSession,
  parseNiaBrowserToolArgs,
  NIA_BROWSER_TOOL_NAME,
} = require("../../../../electron/nia/nia-browser-tools.cjs");

describe("browser owner kind", () => {
  it("maps connection prefixes to lease owner kinds", () => {
    expect(resolveOwnerKindFromConnectionId("nia:run-1")).toBe("nia");
    expect(resolveOwnerKindFromConnectionId("notes:12")).toBe("workflow");
    expect(resolveOwnerKindFromConnectionId("browser-chrome:3")).toBe("workflow");
    expect(resolveOwnerKindFromConnectionId("550e8400-e29b-41d4-a716-446655440000")).toBe("mcp");
    expect(normalizeOwnerKind("nia")).toBe("nia");
    expect(normalizeOwnerKind("nope")).toBe("mcp");
  });

  it("stamps nia owner kind on acquire", () => {
    const leases = createBrowserLeaseManager({
      randomBytes: () => Buffer.alloc(32, 9),
    });
    const control = leases.acquire({
      connectionId: "nia:run-abc",
      windowId: "window-one",
      tabId: "tab-one",
      navigationGeneration: 1,
      controlEpoch: 0,
      ownerKind: "nia",
    });
    expect(leases.assert({
      connectionId: "nia:run-abc",
      windowId: "window-one",
      tabId: "tab-one",
      navigationGeneration: 1,
      controlEpoch: control.controlEpoch,
      leaseToken: control.leaseToken,
    }).owner).toEqual({ id: "nia:run-abc", kind: "nia" });
  });
});

describe("nia browser tools", () => {
  it("parses allowed tool args without trusting lease tokens from the model", () => {
    const parsed = parseNiaBrowserToolArgs({
      action: "navigate",
      url: "https://example.com/",
      leaseToken: "should-be-ignored",
    });
    expect(parsed.request).toEqual({
      action: "navigate",
      url: "https://example.com/",
    });
    expect(parsed).not.toHaveProperty("control");
  });

  it("acquires host-owned control for read and redacts lease tokens in results", async () => {
    const dispatch = vi.fn(async ({ params }) => {
      if (params.request.action === "acquire_control") {
        return {
          control: {
            windowId: "w1",
            tabId: "t1",
            navigationGeneration: 2,
            controlEpoch: 3,
            leaseToken: "secret-token-value",
          },
          target: { url: "https://example.com/" },
        };
      }
      if (params.request.action === "read") {
        expect(params.control.leaseToken).toBe("secret-token-value");
        return { markdown: "# Hello", nodes: [] };
      }
      if (params.request.action === "release_control") {
        return { released: true };
      }
      throw new Error(`unexpected ${params.request.action}`);
    });
    const session = createNiaBrowserSession({
      connectionId: "nia:run-1",
      browserTarget: { windowId: "w1", tabId: "t1" },
      dispatcher: { dispatch, releaseOwnership: vi.fn() },
    });

    const result = await session.executeToolCall({ action: "read" });
    expect(result).toEqual({ markdown: "# Hello", nodes: [] });
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
    expect(dispatch.mock.calls.map((call) => call[0].params.request.action)).toEqual([
      "acquire_control",
      "read",
      "release_control",
    ]);
    await session.dispose();
  });

  it("rejects unknown tool names at the session boundary via parse", () => {
    expect(() => parseNiaBrowserToolArgs({ action: "execute_js", source: "1" }))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
    expect(NIA_BROWSER_TOOL_NAME).toBe("auris_browser");
  });
});
