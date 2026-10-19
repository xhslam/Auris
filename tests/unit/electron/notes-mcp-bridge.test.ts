import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
const canonical = require("../../../electron/shared/browser-contract.cjs");
const { createNotesMcpBridge } = require("../../../electron/notes-mcp-bridge.cjs") as {
  createNotesMcpBridge: (options: {
    browserRequestTimeoutMs?: number;
    cancelBrowserApprovals?: (connectionId: string) => void | Promise<void>;
    dispatchBrowserRequest?: (request: {
      connectionId: string;
      method: string;
      params: Record<string, unknown>;
      principal: { id: string; kind: string; verified: boolean };
      signal: AbortSignal;
    }) => Promise<unknown>;
    dispatchWorkflowRequest?: (request: {
      connectionId: string;
      params: Record<string, unknown>;
      principal: { id: string; kind: string; verified: boolean };
    }) => Promise<unknown>;
    getWindow: () => unknown;
    logger: (message: string) => void;
    maxPendingBrowserRequests?: number;
    removeDiscovery: (instanceId: string) => void;
    releaseBrowserOwnership?: (connectionId: string) => void | Promise<void>;
    releaseWorkflowOwnership?: (connectionId: string) => void | Promise<void>;
    verifyClientCredential?: (input: {
      clientId: string;
      clientToken: string;
    }) => Promise<unknown>;
    writeDiscovery: (content: string) => void;
  }) => {
    close: () => void;
    getServerInfo: () => {
      enabled: boolean;
      port: number | null;
      token?: string | null;
      url?: string | null;
    };
    resolveRequest: (bridgeRequestId: string, result: unknown) => void;
    setReviewRendererReady: (ready: boolean) => void;
    start: () => Promise<{
      enabled: boolean;
      port: number | null;
      token?: string | null;
      url?: string | null;
    }>;
  };
};

describe("notes MCP bridge discovery", () => {
  it.each([false, true])("routes Review requests and requires verified clients for creation (verified=%s)", async verified => {
    const writeDiscovery = vi.fn();
    const rendererSend = vi.fn((_channel: string, payload: { bridgeRequestId: string; request: unknown }) => {
      bridge.resolveRequest(payload.bridgeRequestId, { received: payload.request });
    });
    const bridge = createNotesMcpBridge({
      getWindow: () => ({ isDestroyed: () => false, webContents: { send: rendererSend } }),
      logger: vi.fn(), removeDiscovery: vi.fn(), writeDiscovery,
      verifyClientCredential: async () => verified ? { id: "test-client", kind: "installed-mcp-client", verified: true } : null,
    });
    const { port } = await bridge.start();
    const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`);
    try {
      await authorizeSocket(socket, token);
      const notReady = await waitForMessage(socket, () => socket.send(JSON.stringify({ id: "early", method: "review.mcp.action", params: { action: "list_projects" } })));
      expect(notReady).toMatchObject({ error: { message: expect.stringContaining("REVIEW_NOT_READY") } });
      expect(rendererSend).not.toHaveBeenCalled();
      bridge.setReviewRendererReady(true);
      const read = await waitForMessage(socket, () => socket.send(JSON.stringify({ id: "review-read", method: "review.mcp.action", params: { action: "list_projects" } })));
      expect(read).toMatchObject({ result: { received: { method: "review.mcp.action", params: { action: "list_projects" } } } });
      rendererSend.mockClear();
      for (const action of ["create_project", "create_knowledge_point", "unknown_action"]) {
        const response = await waitForMessage(socket, () => socket.send(JSON.stringify({ id: action, method: "review.mcp.action", params: { action, name: "X" } })));
        if (verified) expect(response).toMatchObject({ result: { received: { method: "review.mcp.action" } } });
        else expect(response).toMatchObject({ error: { code: 403 } });
      }
      expect(rendererSend).toHaveBeenCalledTimes(verified ? 3 : 0);
    } finally { socket.close(); bridge.close(); }
  });

  it("allows legacy clients to read but rejects mutations with reinstall guidance", async () => {
    const rendererSend = vi.fn((_channel: string, payload: {
      bridgeRequestId: string;
    }) => {
      bridge.resolveRequest(payload.bridgeRequestId, { source: "# Readable" });
    });
    const writeDiscovery = vi.fn();
    const bridge = createNotesMcpBridge({
      getWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: rendererSend },
      }),
      logger: vi.fn(),
      removeDiscovery: vi.fn(),
      verifyClientCredential: async () => null,
      writeDiscovery,
    });
    const { port } = await bridge.start();
    const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`);

    try {
      const auth = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "legacy-auth",
          method: "auth",
          params: { token },
        }));
      });
      expect(auth).toMatchObject({
        result: {
          ok: true,
          principal: { id: "unverified-local", verified: false },
        },
      });

      const read = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "legacy-read",
          method: "notes.mcp.document",
          params: { action: "read" },
        }));
      });
      expect(read).toMatchObject({ result: { source: "# Readable" } });

      const write = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "legacy-write",
          method: "notes.mcp.document",
          params: { action: "write", content: "# blocked" },
        }));
      });
      expect(write).toMatchObject({
        error: {
          code: 403,
          message: expect.stringMatching(/credential.*Reinstall/iu),
        },
      });
      expect(rendererSend).toHaveBeenCalledOnce();
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("publishes an ephemeral port in a versioned discovery record, then removes it on close", async () => {
    const writeDiscovery = vi.fn();
    const removeDiscovery = vi.fn();
    const bridge = createNotesMcpBridge({
      getWindow: () => null,
      logger: vi.fn(),
      removeDiscovery,
      writeDiscovery,
    });

    try {
      const info = await bridge.start();

      expect(info.enabled).toBe(true);
      expect(info.port).toBeGreaterThan(0);
      expect(info).not.toHaveProperty("token");
      expect(info).not.toHaveProperty("url");
      expect(writeDiscovery).toHaveBeenCalledOnce();
      expect(JSON.parse(String(writeDiscovery.mock.calls[0]?.[0]))).toMatchObject({
        instance_id: expect.any(String),
        pid: expect.any(Number),
        port: info.port,
        token: expect.stringMatching(/^[0-9a-f-]+$/i),
        version: 1,
      });
    } finally {
      bridge.close();
    }

    expect(removeDiscovery).toHaveBeenCalledWith(
      JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).instance_id,
    );
  });

  it("requires an auth message instead of accepting a token-bearing URL", async () => {
    const writeDiscovery = vi.fn();
    const getWindow = vi.fn(() => ({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }));
    const bridge = createNotesMcpBridge({
      getWindow,
      logger: vi.fn(),
      removeDiscovery: vi.fn(),
      writeDiscovery,
    });

    const { port } = await bridge.start();
    const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/notes-mcp?token=${token}`);

    try {
      const unauthorized = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({ id: "read-1", method: "document.getSource" }));
      });

      expect(unauthorized).toMatchObject({
        error: { code: 401, message: "Unauthorized." },
        id: "read-1",
      });
      expect(getWindow).not.toHaveBeenCalled();

      const authorized = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({ id: "auth-1", method: "auth", params: { token } }));
      });

      expect(authorized).toMatchObject({ id: "auth-1", result: { ok: true } });
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("forwards the private notes state request after authentication", async () => {
    const writeDiscovery = vi.fn();
    const bridgeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn((_channel: string, payload: { bridgeRequestId: string }) => {
          bridge.resolveRequest(payload.bridgeRequestId, { ready: true });
        }),
      },
    };
    const bridge = createNotesMcpBridge({
      getWindow: () => bridgeWindow,
      logger: vi.fn(),
      removeDiscovery: vi.fn(),
      writeDiscovery,
    });

    const { port } = await bridge.start();
    const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`);

    try {
      await waitForMessage(socket, () => {
        socket.send(JSON.stringify({ id: "auth-1", method: "auth", params: { token } }));
      });
      const result = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({ id: "state-1", method: "notes.getState" }));
      });

      expect(result).toEqual({ id: "state-1", jsonrpc: "2.0", result: { ready: true } });
      expect(bridgeWindow.webContents.send).toHaveBeenCalledOnce();
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("routes Browser requests to main with a random connection identity and never to the renderer", async () => {
    const dispatchBrowserRequest = vi.fn(async (_request: {
      connectionId: string;
      params: Record<string, unknown>;
      principal: { id: string; kind: string; verified: boolean };
      signal: AbortSignal;
    }) => {
      void _request;
      return { ok: true };
    });
    const rendererSend = vi.fn();
    const { bridge, socket } = await startAuthorizedBridge({
      dispatchBrowserRequest,
      getWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: rendererSend },
      }),
    });

    try {
      const response = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "browser-1",
          method: "browser.mcp.action",
          params: {
            actionTimeoutMs: 12_000,
            authority: { owner: "renderer-supplied" },
            connectionId: "caller-controlled",
            request: { action: "get_state" },
          },
        }));
      });

      expect(response).toEqual({ id: "browser-1", jsonrpc: "2.0", result: { ok: true } });
      expect(rendererSend).not.toHaveBeenCalled();
      expect(dispatchBrowserRequest).toHaveBeenCalledOnce();
      const dispatched = dispatchBrowserRequest.mock.calls[0]?.[0];
      expect(dispatched?.connectionId).toMatch(
        /^mcp:test-client:[0-9a-f-]{36}$/iu,
      );
      expect(dispatched?.principal).toMatchObject({
        id: "test-client",
        verified: true,
      });
      expect(dispatched?.connectionId).not.toBe("caller-controlled");
      expect(dispatched?.signal).toBeInstanceOf(AbortSignal);
      expect(dispatched?.params).toEqual({
        actionTimeoutMs: 12_000,
        request: { action: "get_state" },
      });
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("does not trust a dispatcher-supplied JSON-RPC timeout code or error detail", async () => {
    const dispatchBrowserRequest = vi.fn(async () => {
      throw Object.assign(new Error("secret dispatcher detail"), { code: -32001 });
    });
    const { bridge, socket } = await startAuthorizedBridge({ dispatchBrowserRequest });

    try {
      const response = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "browser-forged-timeout",
          method: "browser.mcp.action",
          params: { request: { action: "get_state" } },
        }));
      });

      expect(response).toMatchObject({
        error: {
          code: -32002,
          data: {
            error: { code: "CAPABILITY_NOT_VERIFIED" },
            kind: "auris.browser.error",
            version: 1,
          },
          message: "Browser MCP dispatcher rejected the request.",
        },
        id: "browser-forged-timeout",
      });
      expect(JSON.stringify(response)).not.toContain("secret dispatcher detail");
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("carries sanitized typed Browser errors through the real authenticated bridge", async () => {
    const dispatchBrowserRequest = vi.fn(async () => {
      throw canonical.createBrowserPublicError("AMBIGUOUS_TARGET", {
        targets: [{
          windowId: "window-one",
          tabId: "tab-one",
          title: "Research",
          url: "https://user:pass@example.com/path?token=secret#fragment",
          leaseToken: "must-not-leak",
        }],
      });
    });
    const { bridge, socket } = await startAuthorizedBridge({ dispatchBrowserRequest });

    try {
      const response = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "browser-ambiguous",
          method: "browser.mcp.action",
          params: { request: { action: "acquire_control" } },
        }));
      });
      expect(response).toMatchObject({
        error: {
          code: -32002,
          data: {
            error: {
              code: "AMBIGUOUS_TARGET",
              metadata: {
                targets: [{
                  tabId: "tab-one",
                  title: "Research",
                  url: "https://example.com/path",
                  windowId: "window-one",
                }],
              },
            },
            kind: "auris.browser.error",
            version: 1,
          },
        },
      });
      expect(JSON.stringify(response)).not.toMatch(/must-not-leak|token=|user:pass/);
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it.each([
    ["browser.unknown", "Unsupported MCP method: browser.unknown"],
    ["totally-unknown", "Unsupported MCP method: totally-unknown"],
  ])("fails closed for %s", async (method, message) => {
    const dispatchBrowserRequest = vi.fn(async () => ({ ok: true }));
    const rendererSend = vi.fn();
    const { bridge, socket } = await startAuthorizedBridge({
      dispatchBrowserRequest,
      getWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: rendererSend },
      }),
    });

    try {
      const response = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({ id: "closed-1", method }));
      });

      expect(response).toMatchObject({
        error: { code: -32601, message },
        id: "closed-1",
      });
      expect(dispatchBrowserRequest).not.toHaveBeenCalled();
      expect(rendererSend).not.toHaveBeenCalled();
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("routes workflow.mcp.action to the authenticated main-process facade", async () => {
    const dispatchWorkflowRequest = vi.fn(async ({ connectionId, params }) => ({
      connectionId,
      family: params.family,
    }));
    const { bridge, socket } = await startAuthorizedBridge({
      dispatchWorkflowRequest,
      getWindow: () => null,
    });
    try {
      const response = await waitForMessage(socket, () => socket.send(JSON.stringify({
        id: "workflow-1",
        method: "workflow.mcp.action",
        params: { action: "list" },
      })));
      expect(response).toMatchObject({ id: "workflow-1", result: { connectionId: expect.any(String) } });
      expect(dispatchWorkflowRequest).toHaveBeenCalledWith(expect.objectContaining({
        connectionId: expect.any(String),
        params: { action: "list" },
      }));
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("assigns an unpredictable connectionId to each authenticated connection", async () => {
    const connectionIds: string[] = [];
    const dispatchBrowserRequest = vi.fn(async ({ connectionId }: { connectionId: string }) => {
      connectionIds.push(connectionId);
      return { ok: true };
    });
    const writeDiscovery = vi.fn();
    const bridge = createNotesMcpBridge({
      dispatchBrowserRequest,
      getWindow: () => null,
      logger: vi.fn(),
      removeDiscovery: vi.fn(),
      verifyClientCredential: async () => ({
        id: "test-client",
        kind: "installed-mcp-client",
        verified: true,
      }),
      writeDiscovery,
    });
    const { port } = await bridge.start();
    const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
    const sockets = [
      new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`),
      new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`),
    ];

    try {
      for (const [index, socket] of sockets.entries()) {
        await authorizeSocket(socket, token);
        await waitForMessage(socket, () => {
          socket.send(JSON.stringify({
            id: `browser-${index}`,
            method: "browser.mcp.action",
            params: { request: { action: "get_state" } },
          }));
        });
      }

      expect(new Set(connectionIds).size).toBe(2);
      expect(connectionIds).toEqual([
        expect.stringMatching(/^mcp:test-client:[0-9a-f-]{36}$/i),
        expect.stringMatching(/^mcp:test-client:[0-9a-f-]{36}$/i),
      ]);
    } finally {
      sockets.forEach((socket) => socket.close());
      bridge.close();
    }
  });

  it("bounds in-flight Browser requests per connection", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const dispatchBrowserRequest = vi.fn(() => new Promise((resolve) => {
      resolveFirst ??= resolve;
    }));
    const { bridge, socket } = await startAuthorizedBridge({
      dispatchBrowserRequest,
      maxPendingBrowserRequests: 1,
    });

    try {
      socket.send(JSON.stringify({
        id: "browser-pending",
        method: "browser.mcp.action",
        params: { request: { action: "get_state" } },
      }));
      await vi.waitFor(() => expect(dispatchBrowserRequest).toHaveBeenCalledOnce());

      const limited = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "browser-limited",
          method: "browser.mcp.action",
          params: { request: { action: "get_state" } },
        }));
      });

      expect(limited).toMatchObject({
        error: { code: -32000, message: "Browser MCP request limit reached." },
        id: "browser-limited",
      });
      expect(dispatchBrowserRequest).toHaveBeenCalledOnce();
      const resolvePending =
        resolveFirst as unknown as ((value: unknown) => void) | null;
      resolvePending?.({ ok: true });
      await waitForSocketMessage(socket, (message) => message.id === "browser-pending");
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("aborts Browser work and releases connection-scoped state on disconnect", async () => {
    let observedSignal: AbortSignal | null = null;
    const dispatchBrowserRequest = vi.fn(({
      connectionId: _connectionId,
      signal,
    }: {
      connectionId: string;
      signal: AbortSignal;
    }) => {
      void _connectionId;
      observedSignal = signal;
      return new Promise(() => undefined);
    });
    const releaseBrowserOwnership = vi.fn();
    const cancelBrowserApprovals = vi.fn();
    const { bridge, socket } = await startAuthorizedBridge({
      cancelBrowserApprovals,
      dispatchBrowserRequest,
      releaseBrowserOwnership,
    });

    try {
      socket.send(JSON.stringify({
        id: "browser-pending",
        method: "browser.mcp.action",
        params: { request: { action: "get_state" } },
      }));
      await vi.waitFor(() => expect(observedSignal).not.toBeNull());
      const connectionId = dispatchBrowserRequest.mock.calls[0]?.[0].connectionId;

      socket.close();
      await vi.waitFor(() => expect(observedSignal?.aborted).toBe(true));
      expect(releaseBrowserOwnership).toHaveBeenCalledWith(connectionId);
      expect(cancelBrowserApprovals).toHaveBeenCalledWith(connectionId);
    } finally {
      bridge.close();
    }
  });

  it("times out Browser work, clears the slot, and discards a late result", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    let firstSignal: AbortSignal | null = null;
    const dispatchBrowserRequest = vi.fn((request: { signal: AbortSignal }) => {
      if (!resolveFirst) {
        firstSignal = request.signal;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ attempt: 2 });
    });
    const { bridge, socket } = await startAuthorizedBridge({
      browserRequestTimeoutMs: 20,
      dispatchBrowserRequest,
      maxPendingBrowserRequests: 1,
    });
    const received: Array<Record<string, unknown>> = [];
    socket.on("message", (data) => {
      received.push(JSON.parse(data.toString("utf8")) as Record<string, unknown>);
    });

    try {
      socket.send(JSON.stringify({
        id: "browser-timeout",
        method: "browser.mcp.action",
        params: { request: { action: "get_state" } },
      }));
      const timeout = await waitForSocketMessage(
        socket,
        (message) => message.id === "browser-timeout",
      );
      expect(timeout).toMatchObject({
        error: { code: -32001, message: "Browser MCP request timed out." },
      });
      expect((firstSignal as unknown as AbortSignal | null)?.aborted).toBe(true);

      const second = await waitForMessage(socket, () => {
        socket.send(JSON.stringify({
          id: "browser-after-timeout",
          method: "browser.mcp.action",
          params: { request: { action: "get_state" } },
        }));
      });
      expect(second).toMatchObject({ result: { attempt: 2 } });

      const resolveLate =
        resolveFirst as unknown as ((value: unknown) => void) | null;
      resolveLate?.({ late: true });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(received.filter((message) => message.id === "browser-timeout")).toHaveLength(1);
    } finally {
      socket.close();
      bridge.close();
    }
  });

  it("releases Browser state and aborts pending work when the bridge shuts down", async () => {
    let observedSignal: AbortSignal | null = null;
    const dispatchBrowserRequest = vi.fn(({
      connectionId: _connectionId,
      signal,
    }: {
      connectionId: string;
      signal: AbortSignal;
    }) => {
      void _connectionId;
      observedSignal = signal;
      return new Promise(() => undefined);
    });
    const releaseBrowserOwnership = vi.fn();
    const cancelBrowserApprovals = vi.fn();
    const { bridge, socket } = await startAuthorizedBridge({
      cancelBrowserApprovals,
      dispatchBrowserRequest,
      releaseBrowserOwnership,
    });

    socket.send(JSON.stringify({
      id: "browser-pending",
      method: "browser.mcp.action",
      params: { request: { action: "get_state" } },
    }));
    await vi.waitFor(() => expect(observedSignal).not.toBeNull());
    const connectionId = dispatchBrowserRequest.mock.calls[0]?.[0].connectionId;

    bridge.close();

    await vi.waitFor(() => expect(observedSignal?.aborted).toBe(true));
    expect(releaseBrowserOwnership).toHaveBeenCalledWith(connectionId);
    expect(cancelBrowserApprovals).toHaveBeenCalledWith(connectionId);
    socket.close();
  });
});

async function startAuthorizedBridge(overrides: Partial<Parameters<typeof createNotesMcpBridge>[0]> = {}) {
  const writeDiscovery = vi.fn();
  const bridge = createNotesMcpBridge({
    getWindow: () => null,
    logger: vi.fn(),
    removeDiscovery: vi.fn(),
    verifyClientCredential: async ({ clientId, clientToken }) =>
      clientId === "test-client" && clientToken === "test-token"
        ? {
            id: clientId,
            kind: "installed-mcp-client",
            verified: true,
          }
        : null,
    writeDiscovery,
    ...overrides,
  });
  const { port } = await bridge.start();
  const token = JSON.parse(String(writeDiscovery.mock.calls[0]?.[0])).token;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/notes-mcp`);
  await authorizeSocket(socket, token);
  return { bridge, socket };
}

async function authorizeSocket(socket: WebSocket, token: string) {
  await waitForMessage(socket, () => {
    socket.send(JSON.stringify({
      id: "auth-1",
      method: "auth",
      params: {
        client_id: "test-client",
        client_token: "test-token",
        token,
      },
    }));
  });
}

function waitForMessage(socket: WebSocket, send: () => void) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for bridge response."));
    }, 1_000);

    const onOpen = () => {
      socket.off("open", onOpen);
      send();
    };
    const onMessage = (data: WebSocket.RawData) => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(JSON.parse(data.toString("utf8")) as Record<string, unknown>);
    };
    const onError = (error: Error) => {
      clearTimeout(timeout);
      socket.off("error", onError);
      reject(error);
    };

    socket.once("open", onOpen);
    socket.once("message", onMessage);
    socket.once("error", onError);

    if (socket.readyState === WebSocket.OPEN) {
      onOpen();
    }
  });
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for matching bridge response."));
    }, 1_000);
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString("utf8")) as Record<string, unknown>;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}
