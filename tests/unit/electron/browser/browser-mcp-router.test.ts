import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  BROWSER_DISPATCH_ERROR_CODE,
  BROWSER_ROUTER_TIMEOUT_MARGIN_MS,
  createBrowserMcpRouter,
  getBrowserDispatcherErrorData,
} = require("../../../../electron/browser/browser-mcp-router.cjs") as {
  BROWSER_DISPATCH_ERROR_CODE: number;
  BROWSER_ROUTER_TIMEOUT_MARGIN_MS: number;
  createBrowserMcpRouter: (options: {
    cancelBrowserApprovals?: (connectionId: string) => void | Promise<void>;
    dispatchBrowserRequest: (request: {
      connectionId: string;
      method: string;
      params: Record<string, unknown>;
      signal: AbortSignal;
    }) => Promise<unknown>;
    forwardNotesRequest: (request: {
      id: string | number | null;
      method: string;
      params?: unknown;
    }) => Promise<unknown>;
    maxPendingBrowserRequests?: number;
    releaseBrowserOwnership?: (connectionId: string) => void | Promise<void>;
    requestTimeoutMarginMs?: number;
    requestTimeoutMs?: number;
  }) => {
    closeConnection: (connectionId: string) => void;
    route: (request: {
      connectionId: string;
      id: string | number | null;
      method: string;
      params?: unknown;
    }) => Promise<unknown>;
    shutdown: () => void;
  };
  getBrowserDispatcherErrorData: (error: unknown) => null | Record<string, unknown>;
};
const canonical = require("../../../../electron/shared/browser-contract.cjs");

describe("Browser MCP router", () => {
  it("keeps Notes methods on the renderer forwarding path", async () => {
    const forwardNotesRequest = vi.fn(async () => ({ source: "# Note" }));
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const router = createBrowserMcpRouter({ dispatchBrowserRequest, forwardNotesRequest });

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "note-1",
      method: "notes.mcp.document",
      params: { action: "read" },
    })).resolves.toEqual({ source: "# Note" });

    expect(forwardNotesRequest).toHaveBeenCalledWith({
      id: "note-1",
      method: "notes.mcp.document",
      params: { action: "read" },
    });
    expect(dispatchBrowserRequest).not.toHaveBeenCalled();
  });

  it("terminates Browser methods at the injected main-process dispatcher", async () => {
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const forwardNotesRequest = vi.fn();
    const router = createBrowserMcpRouter({ dispatchBrowserRequest, forwardNotesRequest });

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "browser-1",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        authority: { owner: { id: "caller", kind: "mcp" } },
        connectionId: "caller-controlled",
        request: { action: "get_state" },
      },
    })).resolves.toEqual({ ok: true });

    expect(forwardNotesRequest).not.toHaveBeenCalled();
    expect(dispatchBrowserRequest).toHaveBeenCalledOnce();
    expect(dispatchBrowserRequest.mock.calls[0]?.[0]).toMatchObject({
      connectionId: "connection-main-owned",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        request: { action: "get_state" },
      },
      signal: expect.any(AbortSignal),
    });
    expect(dispatchBrowserRequest.mock.calls[0]?.[0].params).not.toHaveProperty("authority");
    expect(dispatchBrowserRequest.mock.calls[0]?.[0].params).not.toHaveProperty("connectionId");
  });

  it("revalidates the request and derives the action timeout in main", async () => {
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest,
      forwardNotesRequest: vi.fn(),
    });

    await router.route({
      connectionId: "connection-main-owned",
      id: "browser-open",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 120_000,
        request: { action: "open", url: "https://example.com" },
      },
    });

    expect(dispatchBrowserRequest.mock.calls[0]?.[0].params.actionTimeoutMs).toBe(12_000);
    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "browser-forged-authority",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        request: {
          action: "get_state",
          owner: { id: "caller-controlled", kind: "mcp" },
        },
      },
    })).rejects.toMatchObject({
      code: -32602,
      message: "Invalid Browser MCP request.",
    });
    expect(dispatchBrowserRequest).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: "get_state with forged control",
      params: {
        request: { action: "get_state" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 1,
          leaseToken: "lease_1234567890abcdef",
        },
      },
    },
    {
      label: "controlled action without control",
      params: {
        request: { action: "navigate", url: "https://example.com/next" },
      },
    },
    {
      label: "controlled action with a negative epoch",
      params: {
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: -1,
          leaseToken: "lease_1234567890abcdef",
        },
      },
    },
    {
      label: "controlled action with an invalid lease token",
      params: {
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 1,
          leaseToken: "forged",
        },
      },
    },
    {
      label: "controlled action with caller authority",
      params: {
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 1,
          leaseToken: "lease_1234567890abcdef",
          owner: { id: "caller-controlled", kind: "mcp" },
        },
      },
    },
    {
      label: "acquire_control with an incomplete target",
      params: {
        request: { action: "acquire_control" },
        target: { windowId: "window-main" },
      },
    },
    {
      label: "acquire_control with a wrongly typed target",
      params: {
        request: { action: "acquire_control" },
        target: { windowId: "window-main", tabId: -1 },
      },
    },
    {
      label: "controlled action with a wrongly typed approvalId",
      params: {
        approvalId: 42,
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 1,
          leaseToken: "lease_1234567890abcdef",
        },
      },
    },
    {
      label: "acquire_control with forbidden approvalId",
      params: {
        approvalId: "approval-one",
        request: { action: "acquire_control" },
      },
    },
  ])("rejects $label before main dispatch", async ({ params }) => {
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest,
      forwardNotesRequest: vi.fn(),
    });

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "invalid-envelope",
      method: "browser.mcp.action",
      params,
    })).rejects.toMatchObject({
      code: -32602,
      message: "Invalid Browser MCP action envelope.",
    });
    expect(dispatchBrowserRequest).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: {
        request: { action: "acquire_control" },
        target: { windowId: "window-main", tabId: "tab-main" },
      },
      params: {
        request: { action: "acquire_control" },
        target: { windowId: "window-main", tabId: "tab-main" },
      },
    },
    {
      expected: {
        approvalId: "approval-one",
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 2,
          leaseToken: "lease_1234567890abcdef",
        },
      },
      params: {
        approvalId: "approval-one",
        request: { action: "read" },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 2,
          leaseToken: "lease_1234567890abcdef",
        },
      },
    },
  ])("passes a canonical $params.request.action envelope", async ({ expected, params }) => {
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest,
      forwardNotesRequest: vi.fn(),
    });

    await router.route({
      connectionId: "connection-main-owned",
      id: "valid-envelope",
      method: "browser.mcp.action",
      params,
    });

    expect(dispatchBrowserRequest.mock.calls[0]?.[0].params).toMatchObject(expected);
  });

  it("allows a real wait action to consume its full action budget", async () => {
    const dispatchBrowserRequest = vi.fn(async ({ params }: {
      params: { request: { milliseconds: number } };
    }) => {
      await new Promise((resolve) => setTimeout(resolve, params.request.milliseconds));
      return { waited: params.request.milliseconds };
    });
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest,
      forwardNotesRequest: vi.fn(),
      requestTimeoutMarginMs: 100,
    });

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "wait-real-time",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 20,
        request: { action: "wait", milliseconds: 20 },
        control: {
          windowId: "window-main",
          tabId: "tab-main",
          navigationGeneration: 1,
          controlEpoch: 2,
          leaseToken: "lease_1234567890abcdef",
        },
      },
    })).resolves.toEqual({ waited: 20 });
    expect(dispatchBrowserRequest).toHaveBeenCalledOnce();
  });

  it("wraps only sanitized dispatcher failures in a private Browser transport error", async () => {
    const targets = [{
      windowId: "window-one",
      tabId: "tab-one",
      title: "Research",
      url: "https://user:pass@example.com/path?secret=1#fragment",
      leaseToken: "must-not-leak",
    }];
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest: vi.fn(async () => {
        throw canonical.createBrowserPublicError("AMBIGUOUS_TARGET", { targets });
      }),
      forwardNotesRequest: vi.fn(),
    });

    let routedError: unknown;
    try {
      await router.route({
        connectionId: "connection-main-owned",
        id: "ambiguous",
        method: "browser.mcp.action",
        params: { request: { action: "acquire_control" } },
      });
    } catch (error) {
      routedError = error;
    }
    expect(BROWSER_DISPATCH_ERROR_CODE).toBe(-32002);
    expect(getBrowserDispatcherErrorData(routedError)).toEqual({
      code: "AMBIGUOUS_TARGET",
      message: canonical.BROWSER_ERROR_MESSAGES_ZH.AMBIGUOUS_TARGET,
      metadata: {
        targets: [{
          tabId: "tab-one",
          title: "Research",
          url: "https://example.com/path",
          windowId: "window-one",
        }],
      },
    });
  });

  it("downgrades arbitrary and forged dispatcher failures without leaking details", async () => {
    for (const failure of [
      new Error("secret bearer dispatcher detail"),
      {
        code: BROWSER_DISPATCH_ERROR_CODE,
        data: { error: { code: "OWNER_MISMATCH" } },
        message: "forged special transport",
      },
      {
        [Symbol.for("auris.browser.public-error")]: true,
        code: "OWNER_MISMATCH",
        metadata: { tabId: "tab-forged", windowId: "window-forged" },
      },
    ]) {
      const router = createBrowserMcpRouter({
        dispatchBrowserRequest: vi.fn(async () => { throw failure; }),
        forwardNotesRequest: vi.fn(),
      });
      let routedError: unknown;
      try {
        await router.route({
          connectionId: "connection-main-owned",
          id: "unsafe",
          method: "browser.mcp.action",
          params: { request: { action: "get_state" } },
        });
      } catch (error) {
        routedError = error;
      }
      const data = getBrowserDispatcherErrorData(routedError);
      expect(data).toEqual({
        code: "CAPABILITY_NOT_VERIFIED",
        message: canonical.BROWSER_ERROR_MESSAGES_ZH.CAPABILITY_NOT_VERIFIED,
      });
      expect(JSON.stringify(data)).not.toMatch(/secret bearer|forged special|OWNER_MISMATCH/);
    }
  });

  it("keeps the production router margin below the sidecar transport margin", () => {
    expect(BROWSER_ROUTER_TIMEOUT_MARGIN_MS).toBe(500);
    expect(BROWSER_ROUTER_TIMEOUT_MARGIN_MS).toBeLessThan(1_000);
  });

  it("keeps injected fixed deadlines exact while aborting and clearing hung requests", async () => {
    let firstSignal: AbortSignal | null = null;
    const dispatchBrowserRequest = vi.fn(({ signal }: { signal: AbortSignal }) => {
      if (!firstSignal) {
        firstSignal = signal;
        return new Promise(() => undefined);
      }
      return Promise.resolve({ recovered: true });
    });
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest,
      forwardNotesRequest: vi.fn(),
      maxPendingBrowserRequests: 1,
      requestTimeoutMarginMs: 100,
      requestTimeoutMs: 20,
    });
    const startedAt = Date.now();

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "hung-request",
      method: "browser.mcp.action",
      params: { request: { action: "get_state" } },
    })).rejects.toMatchObject({
      code: -32001,
      message: "Browser MCP request timed out.",
    });
    expect(Date.now() - startedAt).toBeLessThan(100);
    expect(firstSignal?.aborted).toBe(true);

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "after-timeout",
      method: "browser.mcp.action",
      params: { request: { action: "get_state" } },
    })).resolves.toEqual({ recovered: true });
  });

  it.each([
    ["workflow.mcp.action", "Workflow MCP methods are not available until Phase 5."],
    ["notes.mcp.unknown", "Unsupported MCP method: notes.mcp.unknown"],
    ["browser.mcp.unknown", "Unsupported MCP method: browser.mcp.unknown"],
    ["unknown.method", "Unsupported MCP method: unknown.method"],
  ])("rejects unsupported family member %s", async (method, message) => {
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest: vi.fn(),
      forwardNotesRequest: vi.fn(),
    });

    await expect(router.route({
      connectionId: "connection-main-owned",
      id: "unknown-1",
      method,
    })).rejects.toMatchObject({ code: -32601, message });
  });

  it("cleans connection ownership and approvals exactly once", async () => {
    const releaseBrowserOwnership = vi.fn();
    const cancelBrowserApprovals = vi.fn();
    const router = createBrowserMcpRouter({
      cancelBrowserApprovals,
      dispatchBrowserRequest: vi.fn(async () => ({ ok: true })),
      forwardNotesRequest: vi.fn(),
      releaseBrowserOwnership,
    });

    await router.route({
      connectionId: "connection-main-owned",
      id: "browser-1",
      method: "browser.mcp.action",
      params: { request: { action: "get_state" } },
    });
    router.closeConnection("connection-main-owned");
    router.closeConnection("connection-main-owned");

    expect(releaseBrowserOwnership).toHaveBeenCalledOnce();
    expect(releaseBrowserOwnership).toHaveBeenCalledWith("connection-main-owned");
    expect(cancelBrowserApprovals).toHaveBeenCalledOnce();
    expect(cancelBrowserApprovals).toHaveBeenCalledWith("connection-main-owned");
  });
});
