import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserRegistry } = require(
  "../../../../electron/browser/browser-registry.cjs",
);
const { createBrowserCommandDispatcher } = require(
  "../../../../electron/browser/browser-command-dispatcher.cjs",
);
const { createBrowserPageExecutor } = require(
  "../../../../electron/browser/browser-page-executor.cjs",
);
const { createBrowserApprovalManager, hashBrowserApprovalPayload } = require(
  "../../../../electron/browser/browser-approvals.cjs",
);
const { createBrowserLeaseManager } = require(
  "../../../../electron/browser/browser-lease.cjs",
);
const { createBrowserMcpRouter, getBrowserDispatcherErrorData } = require(
  "../../../../electron/browser/browser-mcp-router.cjs",
);
const { createBrowserPartitionSelector } = require(
  "../../../../electron/browser/browser-partitions.cjs",
);
const { createBrowserNavigationPolicy } = require(
  "../../../../electron/browser/browser-navigation-policy.cjs",
);
const { serializeBrowserError } = require(
  "../../../../electron/shared/browser-contract.cjs",
);

type OpenedTarget = {
  control: {
    controlEpoch: number;
    leaseToken: string;
    navigationGeneration: number;
    tabId: string;
    windowId: string;
  };
  target: { tabId: string; windowId: string };
};

function createFixture() {
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const approvals = createBrowserApprovalManager();
  const sourceControlEpochs = new Map<string, number>();
  const executor = {
    execute: vi.fn(async ({ request }: { request: { action: string } }) => ({
      action: request.action,
    })),
  };
  const aiSandboxSession = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  };
  const pagePolicyAttach = vi.fn(() => vi.fn());
  const realPartitionSelector = createBrowserPartitionSelector({
    createPagePolicy: () => ({ attach: pagePolicyAttach }),
    getSession: () => aiSandboxSession,
  });
  const partitionContext = realPartitionSelector.select("AiSandbox");
  const partitionSelector = {
    select: vi.fn((automationMode: string) => realPartitionSelector.select(automationMode)),
  };
  function createWebContents({
    session = aiSandboxSession,
    url = "",
  }: { session?: object; url?: string } = {}) {
    return { getURL: () => url, session };
  }
  async function createTarget(
    url: string,
    {
      attachPolicy = true,
      webContents = createWebContents(),
    }: { attachPolicy?: boolean; webContents?: ReturnType<typeof createWebContents> } = {},
  ) {
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode: "AiSandbox",
      title: "Research",
      url,
    });
    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    if (attachPolicy) partitionContext.attachPagePolicy(webContents);
    return {
      automationMode: "AiSandbox",
      partition: partitionContext.partition,
      tabId: tab.tabId,
      webContents,
      windowId: window.windowId,
    };
  }
  const createAiSandboxTarget = vi.fn(async ({ url }: { url: string }) => createTarget(url));
  const destroyTarget = vi.fn(async () => true);
  const navigationPolicy = createBrowserNavigationPolicy({
    allowLoopback: true,
    resolveDns: async () => ["93.184.216.34"],
  });
  const createDispatcher = (nextExecutor: unknown) => createBrowserCommandDispatcher({
    approvals,
    createAiSandboxTarget,
    destroyTarget,
    executor: nextExecutor,
    getCurrentControlEpoch: ({ tab, tabId, windowId }: {
      tab: { controlEpoch: number };
      tabId: string;
      windowId: string;
    }) => sourceControlEpochs.get(`${windowId}/${tabId}`) ?? tab.controlEpoch,
    leases,
    navigationPolicy,
    partitionSelector,
    registry,
  });
  const dispatcher = createDispatcher(executor);
  const dispatch = (connectionId: string, params: Record<string, unknown>) => dispatcher.dispatch({
    connectionId,
    method: "browser.mcp.action",
    params: { actionTimeoutMs: 12_000, ...params },
    signal: new AbortController().signal,
  });
  return {
    approvals,
    aiSandboxSession,
    createAiSandboxTarget,
    createDispatcher,
    createTarget,
    createWebContents,
    dispatch,
    dispatcher,
    destroyTarget,
    executor,
    leases,
    partitionContext,
    partitionSelector,
    registry,
    setCurrentControlEpoch(windowId: string, tabId: string, controlEpoch: number) {
      sourceControlEpochs.set(`${windowId}/${tabId}`, controlEpoch);
    },
  };
}

describe("browser command dispatcher", () => {
  it("returns APPROVAL_REQUIRED promptly, frees the router slot, then consumes exact allow-once", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com/start?private=one" },
    });
    const router = createBrowserMcpRouter({
      dispatchBrowserRequest: (input: Record<string, unknown>) => fixture.dispatcher.dispatch(input),
      forwardNotesRequest: vi.fn(),
      maxPendingBrowserRequests: 1,
    });
    const request = {
      control: opened.control,
      request: { action: "navigate", url: "https://docs.example/next?query=private" },
    };

    const error = await router.route({
      connectionId: "connection-one",
      id: "approval-first-call",
      method: "browser.mcp.action",
      params: request,
    }).catch((caught: unknown) => caught);

    expect(getBrowserDispatcherErrorData(error)).toMatchObject({
      code: "APPROVAL_REQUIRED",
      metadata: {
        action: "navigate",
        approvalId: expect.any(String),
        operation: "navigate",
        origin: "https://example.com",
        tabId: opened.target.tabId,
        windowId: opened.target.windowId,
      },
    });
    expect(fixture.executor.execute).not.toHaveBeenCalled();
    await expect(router.route({
      connectionId: "connection-one",
      id: "slot-is-free",
      method: "browser.mcp.action",
      params: { request: { action: "get_state" } },
    })).resolves.toHaveProperty("targets");

    const pending = fixture.approvals.snapshot().pendingApprovals[0];
    expect(pending.destination).toBe("https://docs.example/next");
    fixture.approvals.resolve({
      approvalId: pending.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    await expect(fixture.dispatch("connection-one", {
      ...request,
      approvalId: pending.approvalId,
    })).resolves.toEqual({ action: "navigate" });
    expect(fixture.executor.execute).toHaveBeenLastCalledWith(expect.objectContaining({
      approvedPayloadHash: hashBrowserApprovalPayload(request.request),
    }));
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
  });

  it("publishes only the main-derived target alias through MCP metadata and chrome snapshots", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-opaque-target", {
      request: { action: "open", url: "https://example.com/start" },
    });
    const rawRef = "bank-transfer-confirm";
    const error = await fixture.dispatch("connection-opaque-target", {
      control: opened.control,
      request: { action: "act", variant: "click", target: { kind: "ref", ref: rawRef } },
    }).catch((caught: unknown) => caught);

    const wire = serializeBrowserError(error);
    expect(wire).toMatchObject({
      code: "APPROVAL_REQUIRED",
      metadata: { target: { kind: "ref", ref: expect.stringMatching(/^target-[0-9a-f]{24}$/u) } },
    });
    const pending = fixture.approvals.snapshot().pendingApprovals[0];
    expect(pending.target).toEqual(wire.metadata.target);
    expect(JSON.stringify({ pending, wire })).not.toContain(rawRef);
  });

  it("does not create authority when disconnect wins before the dispatcher microtask starts", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-race", {
      request: { action: "open", url: "https://example.com/start" },
    });
    const router = createBrowserMcpRouter({
      cancelBrowserApprovals: fixture.dispatcher.cancelPendingApprovals,
      dispatchBrowserRequest: (input: Record<string, unknown>) => fixture.dispatcher.dispatch(input),
      forwardNotesRequest: vi.fn(),
      releaseBrowserOwnership: fixture.dispatcher.releaseOwnership,
    });
    const pending = router.route({
      connectionId: "connection-race",
      id: "disconnect-race",
      method: "browser.mcp.action",
      params: {
        control: opened.control,
        request: { action: "navigate", url: "https://example.com/after" },
      },
    });
    router.closeConnection("connection-race");

    await expect(pending).rejects.toMatchObject({ code: -32000 });
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
    expect(fixture.leases.snapshot().leases).toEqual([]);

    const cancelled = new AbortController();
    cancelled.abort();
    await expect(fixture.dispatcher.dispatch({
      connectionId: "connection-discovery-race",
      params: { request: { action: "get_state" } },
      signal: cancelled.signal,
    })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("does not consume approval on a substituted retry and never approves unavailable powers", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com/start" },
    });
    const original = { action: "navigate", url: "https://docs.example/allowed" };
    const firstError = await fixture.dispatch("connection-one", {
      control: opened.control,
      request: original,
    }).catch((caught: unknown) => caught);
    const approvalId = serializeBrowserError(firstError).metadata.approvalId;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });

    await expect(fixture.dispatch("connection-one", {
      approvalId,
      control: opened.control,
      request: { ...original, url: "https://evil.example/substitution" },
    })).rejects.toMatchObject({ code: "PAYLOAD_MISMATCH" });
    await expect(fixture.dispatch("connection-one", {
      approvalId,
      control: opened.control,
      request: original,
    })).resolves.toEqual({ action: "navigate" });

    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "execute_js", source: "document.cookie" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
  });

  it.each([
    { action: "navigate", url: "https://example.com/next" },
    { action: "act", variant: "click", target: { kind: "ref", ref: "ref-button" } },
    { action: "screenshot", publication: "evidence" },
  ])("does not create approval for unavailable executor action $action", async (request) => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-no-executor", {
      request: { action: "open", url: "https://example.com/start" },
    });
    const dispatcher = fixture.createDispatcher(null);

    await expect(dispatcher.dispatch({
      connectionId: "connection-no-executor",
      params: { control: opened.control, request },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
  });

  it.each([
    { action: "read" },
    { action: "wait", milliseconds: 1 },
    { action: "screenshot" },
  ])("executes read-class $action without approval", async (request) => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com/start" },
    });
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request,
    })).resolves.toEqual({ action: request.action });
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
  });
  it("requires registry authority to quarantine a failed target", () => {
    expect(() => createBrowserCommandDispatcher({
      createAiSandboxTarget: vi.fn(),
      destroyTarget: vi.fn(),
      getCurrentControlEpoch: vi.fn(),
      partitionSelector: { select: vi.fn() },
      registry: { snapshot: vi.fn() },
    })).toThrow(/closeTab/i);
  });

  it("returns redacted state without requiring a lease", async () => {
    const fixture = createFixture();
    const window = fixture.registry.createWindow();
    const tab = fixture.registry.createTab(window.windowId, {
      automationMode: "Human",
      sessionIdentity: "session-secret",
      profileIdentity: "profile-secret",
      title: "Visible title",
      url: "https://user:pass@example.com/path?token=secret#hash",
    });

    const state = await fixture.dispatch("connection-one", {
      request: { action: "get_state" },
    });

    expect(state.targets).toEqual([{
      tabId: tab.tabId,
      title: "Visible title",
      url: "https://example.com/path",
      windowId: window.windowId,
    }]);
    expect(JSON.stringify(state)).not.toMatch(/secret|profileIdentity|sessionIdentity|leaseToken/i);
  });

  it("opens only a shared non-persistent AiSandbox target and returns owner-bound control", async () => {
    const fixture = createFixture();
    const result = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com/research" },
    });

    expect(fixture.partitionSelector.select).toHaveBeenCalledWith("AiSandbox");
    expect(fixture.createAiSandboxTarget).toHaveBeenCalledWith(expect.objectContaining({
      automationMode: "AiSandbox",
      partition: fixture.partitionContext,
      url: "https://example.com/research",
    }));
    expect(result.control).toMatchObject({
      navigationGeneration: 0,
      windowId: result.target.windowId,
      tabId: result.target.tabId,
    });
    expect(result.control.leaseToken).toHaveLength(43);
    expect(() => fixture.leases.assert({
      connectionId: "connection-two",
      ...result.control,
    })).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
  });

  it("refuses an open adapter that falls back to Human", async () => {
    const fixture = createFixture();
    fixture.createAiSandboxTarget.mockImplementationOnce(async () => {
      const window = fixture.registry.createWindow();
      const tab = fixture.registry.createTab(window.windowId, { automationMode: "Human" });
      return {
        automationMode: "Human",
        partition: "persist:human",
        windowId: window.windowId,
        tabId: tab.tabId,
      };
    });

    await expect(fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    expect(fixture.destroyTarget).toHaveBeenCalledOnce();
  });

  it("rejects a target whose adapter attests the wrong actual partition", async () => {
    const fixture = createFixture();
    fixture.createAiSandboxTarget.mockImplementationOnce(async ({ url }) => {
      const window = fixture.registry.createWindow();
      const tab = fixture.registry.createTab(window.windowId, {
        automationMode: "AiSandbox",
        url,
      });
      return {
        automationMode: "AiSandbox",
        partition: "persist:human",
        windowId: window.windowId,
        tabId: tab.tabId,
      };
    });
    await expect(fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    expect(fixture.destroyTarget).toHaveBeenCalledOnce();
  });

  it.each(["unattached", "replayed-object"])(
    "rejects %s page-policy attestation without issuing a lease",
    async (kind) => {
      const fixture = createFixture();
      fixture.createAiSandboxTarget.mockImplementationOnce(async ({ url }) => {
        if (kind === "unattached") {
          return fixture.createTarget(url, { attachPolicy: false });
        }
        const attached = fixture.createWebContents();
        fixture.partitionContext.attachPagePolicy(attached);
        return fixture.createTarget(url, {
          attachPolicy: false,
          webContents: { ...attached },
        });
      });

      await expect(fixture.dispatch("connection-one", {
        request: { action: "open", url: "https://example.com" },
      })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
      expect(fixture.destroyTarget).toHaveBeenCalledOnce();
      expect(fixture.leases.snapshot().leases).toEqual([]);
    },
  );

  it.each(["throw", "undefined", "hang"])(
    "quarantines a failed target before an unconfirmed native destroy can %s",
    async (destroyEnding) => {
      const fixture = createFixture();
      let failedTarget: Awaited<ReturnType<typeof fixture.createTarget>> | null = null;
      fixture.createAiSandboxTarget.mockImplementationOnce(async ({ url }) => {
        failedTarget = await fixture.createTarget(url);
        return { ...failedTarget, partition: "persist:wrong" };
      });
      if (destroyEnding === "throw") {
        fixture.destroyTarget.mockRejectedValueOnce(new Error("native-cleanup-secret"));
      } else if (destroyEnding === "undefined") {
        fixture.destroyTarget.mockResolvedValueOnce(undefined);
      } else {
        fixture.destroyTarget.mockImplementationOnce(() => new Promise(() => undefined));
      }

      const pending = fixture.dispatch("connection-one", {
        request: { action: "open", url: "https://example.com/failed" },
      });
      let settled = false;
      void pending.then(
        () => { settled = true; },
        () => { settled = true; },
      );
      await vi.waitFor(() => expect(fixture.destroyTarget).toHaveBeenCalledOnce());
      const quarantined = failedTarget!;

      await expect(fixture.dispatch("connection-two", {
        request: { action: "acquire_control" },
        target: { tabId: quarantined.tabId, windowId: quarantined.windowId },
      })).rejects.toMatchObject({
        code: expect.stringMatching(/TAB_NOT_FOUND|WINDOW_NOT_FOUND/),
      });
      expect(fixture.leases.snapshot().leases).toEqual([]);
      expect(fixture.partitionContext.isPagePolicyAttached(quarantined.webContents)).toBe(true);

      if (destroyEnding === "hang") {
        await Promise.resolve();
        expect(settled).toBe(false);
      } else {
        const error = await pending.catch((caught) => caught);
        expect(error).toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
        expect(JSON.stringify(serializeBrowserError(error))).not.toContain("native-cleanup-secret");
      }
    },
  );

  it("removes page-policy proof only after native teardown is confirmed", async () => {
    const fixture = createFixture();
    let failedTarget: Awaited<ReturnType<typeof fixture.createTarget>> | null = null;
    fixture.createAiSandboxTarget.mockImplementationOnce(async ({ url }) => {
      failedTarget = await fixture.createTarget(url);
      return { ...failedTarget, partition: "persist:wrong" };
    });

    await expect(fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com/failed" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });

    expect(fixture.destroyTarget).toHaveBeenCalledOnce();
    expect(fixture.partitionContext.isPagePolicyAttached(failedTarget!.webContents)).toBe(false);
    expect(fixture.registry.getWindow(failedTarget!.windowId)).toBeNull();
    expect(fixture.leases.snapshot().leases).toEqual([]);
  });

  it("destroys a deferred target when the real signal aborts before handoff", async () => {
    const fixture = createFixture();
    let resolveFactory: (() => void) | null = null;
    fixture.createAiSandboxTarget.mockImplementationOnce(({ url }) =>
      new Promise((resolve) => {
        resolveFactory = () => { void fixture.createTarget(url).then(resolve); };
      }));
    const controller = new AbortController();
    const pending = fixture.dispatcher.dispatch({
      connectionId: "connection-one",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        request: { action: "open", url: "https://example.com" },
      },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(resolveFactory).toBeTypeOf("function"));

    controller.abort();
    resolveFactory?.();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fixture.destroyTarget).toHaveBeenCalledOnce();
    expect(fixture.leases.snapshot().leases).toEqual([]);
  });

  it.each(["timeout", "disconnect"])(
    "cleans a late open target after router %s and leaves later acquisition available",
    async (ending) => {
      const fixture = createFixture();
      let resolveFactory: (() => void) | null = null;
      let lateTarget: Awaited<ReturnType<typeof fixture.createTarget>> | null = null;
      fixture.createAiSandboxTarget.mockImplementationOnce(({ url }) =>
        new Promise((resolve) => {
          resolveFactory = () => {
            void fixture.createTarget(url).then((target) => {
              lateTarget = target;
              resolve(target);
            });
          };
        }));
      fixture.destroyTarget.mockImplementationOnce(() => new Promise(() => undefined));
      const router = createBrowserMcpRouter({
        dispatchBrowserRequest: (request: Record<string, unknown>) =>
          fixture.dispatcher.dispatch(request),
        forwardNotesRequest: vi.fn(),
        requestTimeoutMs: ending === "timeout" ? 15 : 500,
      });
      const pending = router.route({
        connectionId: "connection-one",
        id: "late-open",
        method: "browser.mcp.action",
        params: { request: { action: "open", url: "https://example.com" } },
      });
      void pending.catch(() => undefined);
      await vi.waitFor(
        () => expect(resolveFactory).toBeTypeOf("function"),
        { interval: 1 },
      );

      if (ending === "disconnect") router.closeConnection("connection-one");
      await expect(pending).rejects.toMatchObject({
        code: ending === "timeout" ? -32001 : -32000,
      });
      resolveFactory?.();
      await vi.waitFor(() => expect(fixture.destroyTarget).toHaveBeenCalledOnce());
      const quarantined = lateTarget!;
      expect(fixture.leases.snapshot().leases).toEqual([]);
      expect(fixture.partitionContext.isPagePolicyAttached(quarantined.webContents)).toBe(true);
      await expect(fixture.dispatch("connection-next", {
        request: { action: "acquire_control" },
        target: { tabId: quarantined.tabId, windowId: quarantined.windowId },
      })).rejects.toMatchObject({
        code: expect.stringMatching(/TAB_NOT_FOUND|WINDOW_NOT_FOUND/),
      });

      const available = await fixture.createTarget("https://example.com/available");
      await expect(fixture.dispatch("connection-next", {
        request: { action: "acquire_control" },
        target: { tabId: available.tabId, windowId: available.windowId },
      })).resolves.toMatchObject({ control: { leaseToken: expect.any(String) } });
    },
  );

  it("acquires one explicit or unambiguous eligible AiSandbox tab", async () => {
    const fixture = createFixture();
    const window = fixture.registry.createWindow();
    const tab = fixture.registry.createTab(window.windowId, { automationMode: "AiSandbox" });
    fixture.registry.setTabLifecycle(window.windowId, tab.tabId, "ready");

    const result = await fixture.dispatch("connection-one", {
      request: { action: "acquire_control" },
    });
    expect(result.target).toMatchObject({ windowId: window.windowId, tabId: tab.tabId });
    expect(result.control.leaseToken).toBeTypeOf("string");
  });

  it("lets the same connection reacquire explicitly and rotates the old control", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    const reacquired = await fixture.dispatch("connection-one", {
      request: { action: "acquire_control" },
      target: opened.target,
    });
    expect(reacquired.control.controlEpoch).toBeGreaterThan(opened.control.controlEpoch);
    expect(reacquired.control.leaseToken).not.toBe(opened.control.leaseToken);
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).rejects.toMatchObject({
      code: expect.stringMatching(/CONTROL_STALE|LEASE_LOST/),
    });
    await expect(fixture.dispatch("connection-one", {
      control: reacquired.control,
      request: { action: "read" },
    })).resolves.toEqual({ action: "read" });
    await expect(fixture.dispatch("connection-two", {
      request: { action: "acquire_control" },
      target: opened.target,
    })).rejects.toMatchObject({ code: "OWNER_MISMATCH" });
  });

  it("never implicitly chooses among multiple eligible targets and exposes only safe discovery metadata", async () => {
    const fixture = createFixture();
    for (const url of ["https://one.test/?secret=1", "https://two.test/#secret"]) {
      const window = fixture.registry.createWindow();
      const tab = fixture.registry.createTab(window.windowId, {
        automationMode: "AiSandbox",
        title: `Research ${url.includes("one") ? "one" : "two"}`,
        url,
      });
      fixture.registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    }

    let ambiguityError: unknown;
    try {
      await fixture.dispatch("connection-one", {
        request: { action: "acquire_control" },
      });
    } catch (error) {
      ambiguityError = error;
    }
    expect(ambiguityError).toMatchObject({ code: "AMBIGUOUS_TARGET" });
    const state = await fixture.dispatch("connection-one", { request: { action: "get_state" } });
    expect(serializeBrowserError(ambiguityError).metadata.targets).toEqual(state.targets);
    expect(state.targets).toHaveLength(2);
    expect(state.targets.every((entry: object) =>
      Object.keys(entry).sort().join(",") === "tabId,title,url,windowId"
    )).toBe(true);
    expect(JSON.stringify(state)).not.toContain("secret");
  });

  it.each(["Human", "AiShared"])(
    "allows acquisition of %s tabs under the mode-authority matrix",
    async (automationMode) => {
      const fixture = createFixture();
      const window = fixture.registry.createWindow();
      const tab = fixture.registry.createTab(window.windowId, {
        automationMode,
        url: "https://example.com/start",
      });
      fixture.registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
      await expect(fixture.dispatch("connection-one", {
        request: { action: "acquire_control" },
        target: { windowId: window.windowId, tabId: tab.tabId },
      })).resolves.toMatchObject({
        control: expect.objectContaining({ tabId: tab.tabId }),
        target: expect.objectContaining({ tabId: tab.tabId }),
      });
    },
  );

  it("requires current control for page commands and delegates only after validation", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    const valid = { control: opened.control, request: { action: "read" } };

    await expect(fixture.dispatch("connection-one", { request: { action: "read" } }))
      .rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(fixture.dispatch("connection-two", valid))
      .rejects.toMatchObject({ code: "OWNER_MISMATCH" });
    await expect(fixture.dispatch("connection-one", {
      ...valid,
      control: { ...opened.control, leaseToken: "z".repeat(43) },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });

    await expect(fixture.dispatch("connection-one", valid)).resolves.toEqual({ action: "read" });
    expect(fixture.executor.execute).toHaveBeenCalledOnce();
  });

  it("returns a successful agent navigation only after proving the old control was invalidated", async () => {
    const fixture = createFixture();
    const dispatcherHolder: {
      current?: ReturnType<typeof fixture.createDispatcher>;
    } = {};
    const navigatingExecutor = {
      execute: vi.fn(async ({ control }: { control: OpenedTarget["control"] }) => {
        fixture.registry.commitNavigation(control.windowId, control.tabId, {
          url: "https://example.com/next",
        });
        const committed = fixture.registry.getTab(control.windowId, control.tabId);
        dispatcherHolder.current?.navigationChanged(
          control.windowId,
          control.tabId,
          committed.navigationGeneration,
          committed.controlEpoch,
        );
        return { navigated: true, url: "https://example.com/next" };
      }),
    };
    const dispatcher = fixture.createDispatcher(navigatingExecutor);
    dispatcherHolder.current = dispatcher;
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-navigate",
      method: "browser.mcp.action",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = {
      control: opened.control,
      request: { action: "navigate", url: "https://example.com/next" },
    };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const pending = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: pending.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });

    await expect(call({ ...request, approvalId: pending.approvalId })).resolves.toMatchObject({
      controlInvalidated: true,
      navigated: true,
      navigationGeneration: opened.control.navigationGeneration + 1,
    });
    await expect(call({ control: opened.control, request: { action: "read" } }))
      .rejects.toMatchObject({ code: expect.stringMatching(/CONTROL_STALE|STALE_NAVIGATION|LEASE_LOST/u) });
  });

  it("fails closed when load completes before the trusted navigation lifecycle invalidates the lease", async () => {
    const fixture = createFixture();
    const executor = {
      execute: vi.fn(async ({ control }: { control: OpenedTarget["control"] }) => {
        fixture.registry.commitNavigation(control.windowId, control.tabId, {
          url: "https://example.com/next",
        });
        return { navigated: true, url: "https://example.com/next" };
      }),
    };
    const dispatcher = fixture.createDispatcher(executor);
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-racy-navigate",
      method: "browser.mcp.action",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = {
      control: opened.control,
      request: { action: "navigate", url: "https://example.com/next" },
    };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const pending = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: pending.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    await expect(call({ ...request, approvalId: pending.approvalId }))
      .rejects.toMatchObject({ code: "CONTROL_STALE" });
    expect(fixture.leases.isAvailable(opened.target.windowId, opened.target.tabId)).toBe(false);
  });

  it("returns close success only after the tab is absent and its lease is invalidated", async () => {
    const fixture = createFixture();
    const holder: { current?: ReturnType<typeof fixture.createDispatcher> } = {};
    const executor = {
      execute: vi.fn(async ({ control }: { control: OpenedTarget["control"] }) => {
        fixture.registry.closeTab(control.windowId, control.tabId);
        holder.current?.tabClosed(control.windowId, control.tabId);
        return { closed: true };
      }),
    };
    const dispatcher = fixture.createDispatcher(executor);
    holder.current = dispatcher;
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-close",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = { control: opened.control, request: { action: "close" } };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approval = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: approval.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });

    await expect(call({ ...request, approvalId: approval.approvalId })).resolves.toEqual({
      closed: true,
      controlInvalidated: true,
    });
  });

  it("fails closed when a close adapter claims success but leaves the tab registered", async () => {
    const fixture = createFixture();
    const dispatcher = fixture.createDispatcher({ execute: vi.fn(async () => ({ closed: true })) });
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-false-close",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = { control: opened.control, request: { action: "close" } };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approval = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: approval.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    await expect(call({ ...request, approvalId: approval.approvalId }))
      .rejects.toMatchObject({ code: "CONTROL_STALE" });
    await expect(call({ control: opened.control, request: { action: "read" } }))
      .rejects.toMatchObject({ code: "LEASE_LOST" });
  });

  it("seals lease authority when native close removes the tab before lifecycle delivery", async () => {
    const fixture = createFixture();
    const dispatcher = fixture.createDispatcher({
      execute: vi.fn(async ({ control }: { control: OpenedTarget["control"] }) => {
        fixture.registry.closeTab(control.windowId, control.tabId);
        return { closed: true };
      }),
    });
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-racy-close",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = { control: opened.control, request: { action: "close" } };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approval = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: approval.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    await expect(call({ ...request, approvalId: approval.approvalId })).resolves.toMatchObject({
      closed: true,
      controlInvalidated: true,
    });
    expect(fixture.leases.snapshot().leases).toEqual([]);
  });

  it("quarantines a close target when timeout leaves native completion uncertain", async () => {
    const fixture = createFixture();
    const webContents = {
      getURL: () => "https://example.com",
      isDestroyed: () => false,
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const executor = createBrowserPageExecutor({
      closeTarget: ({ control }: { control: OpenedTarget["control"] }) => new Promise((resolve) => {
        setTimeout(() => {
          fixture.registry.closeTab(control.windowId, control.tabId);
          resolve(true);
        }, 30);
      }),
      getWebContents: () => webContents,
      pageScriptLoader: vi.fn(async () => ({})),
    });
    const dispatcher = fixture.createDispatcher(executor);
    const call = (params: Record<string, unknown>) => dispatcher.dispatch({
      connectionId: "connection-close-timeout",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const request = { control: opened.control, request: { action: "close" } };
    await expect(call(request)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approval = fixture.approvals.snapshot().pendingApprovals[0];
    fixture.approvals.resolve({
      approvalId: approval.approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });

    try {
      await expect(call({
        ...request,
        actionTimeoutMs: 5,
        approvalId: approval.approvalId,
      })).rejects.toMatchObject({ code: "TIMEOUT" });
      expect(fixture.registry.getTab(opened.target.windowId, opened.target.tabId)).toBeNull();
      expect(fixture.leases.snapshot().leases).toEqual([]);
      expect(fixture.destroyTarget).toHaveBeenCalledWith(expect.objectContaining({
        tabId: opened.target.tabId,
        windowId: opened.target.windowId,
      }));
    } finally {
      await executor.cleanup();
    }
  });

  it("revokes old control when focus cancellation leaves native completion uncertain", async () => {
    const fixture = createFixture();
    let markFocusStarted!: () => void;
    const focusStarted = new Promise<void>((resolve) => { markFocusStarted = resolve; });
    const webContents = {
      getURL: () => "https://example.com",
      isDestroyed: () => false,
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const executor = createBrowserPageExecutor({
      focusTarget: () => new Promise((resolve) => {
        markFocusStarted();
        setTimeout(() => resolve({ focused: true }), 30);
      }),
      getWebContents: () => webContents,
      pageScriptLoader: vi.fn(async () => ({})),
    });
    const dispatcher = fixture.createDispatcher(executor);
    const call = (params: Record<string, unknown>, signal = new AbortController().signal) => dispatcher.dispatch({
      connectionId: "connection-focus-cancel",
      params: { actionTimeoutMs: 12_000, ...params },
      signal,
    });
    const opened = await call({ request: { action: "open", url: "https://example.com" } });
    const cancelled = new AbortController();
    const pending = call(
      { control: opened.control, request: { action: "focus" } },
      cancelled.signal,
    );
    await focusStarted;
    cancelled.abort();
    try {
      await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
      expect(fixture.registry.getTab(opened.target.windowId, opened.target.tabId)).toBeDefined();
      expect(fixture.leases.snapshot().leases).toEqual([]);
    } finally {
      await executor.cleanup();
    }
  });

  it("rejects every controlled action when its lease envelope is absent", async () => {
    const fixture = createFixture();
    const requests = [
      { action: "release_control" },
      { action: "close" },
      { action: "focus" },
      { action: "navigate", url: "https://example.com/next" },
      { action: "wait", milliseconds: 1 },
      { action: "wait_for", target: { kind: "selector", selector: "main" } },
      { action: "read" },
      { action: "screenshot" },
      { action: "query", target: { kind: "selector", selector: "main" } },
      { action: "console" },
      { action: "act", variant: "click", target: { kind: "selector", selector: "button" } },
      { action: "style", target: { kind: "selector", selector: "main" }, css: "color:red" },
      { action: "execute_js", source: "document.title" },
      { action: "session_save", name: "research" },
      { action: "session_load", name: "research" },
    ];
    for (const request of requests) {
      await expect(fixture.dispatch("connection-one", { request }))
        .rejects.toMatchObject({ code: "LEASE_LOST" });
    }
    expect(fixture.executor.execute).not.toHaveBeenCalled();
  });

  it("does not let forged generations invalidate the real owner's lease", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    const forged = {
      ...opened.control,
      navigationGeneration: opened.control.navigationGeneration + 1,
    };
    await expect(fixture.dispatch("connection-two", {
      control: { ...forged, connectionId: "connection-one" },
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "OWNER_MISMATCH" });
    await expect(fixture.dispatch("connection-one", {
      control: { ...forged, leaseToken: "f".repeat(43) },
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).resolves.toEqual({ action: "read" });

    await expect(fixture.dispatch("connection-two", {
      control: { ...forged, connectionId: "connection-one" },
      request: { action: "release_control" },
    })).rejects.toMatchObject({ code: "OWNER_MISMATCH" });
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "release_control" },
    })).resolves.toEqual({ released: true });
  });

  it("rejects non-navigation control-source changes for read and release", async () => {
    for (const action of ["read", "release_control"]) {
      const fixture = createFixture();
      const opened = await fixture.dispatch("connection-one", {
        request: { action: "open", url: "https://example.com" },
      });
      fixture.setCurrentControlEpoch(
        opened.target.windowId,
        opened.target.tabId,
        1,
      );
      await expect(fixture.dispatch("connection-one", {
        control: opened.control,
        request: { action },
      })).rejects.toMatchObject({ code: "CONTROL_STALE" });
    }
  });

  it("does not let a forged caller control epoch invalidate valid authority", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    const forged = {
      ...opened.control,
      controlEpoch: opened.control.controlEpoch + 1,
    };
    await expect(fixture.dispatch("connection-one", {
      control: forged,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "CONTROL_STALE" });
    await expect(fixture.dispatch("connection-one", {
      control: forged,
      request: { action: "release_control" },
    })).rejects.toMatchObject({ code: "CONTROL_STALE" });
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).resolves.toEqual({ action: "read" });
  });

  it("exposes a trusted control lifecycle that preserves document generation", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    fixture.setCurrentControlEpoch(opened.target.windowId, opened.target.tabId, 1);
    fixture.dispatcher.controlChanged(opened.target.windowId, opened.target.tabId, 1);
    const reacquired = await fixture.dispatch("connection-one", {
      request: { action: "acquire_control" },
      target: opened.target,
    });

    expect(reacquired.control.navigationGeneration).toBe(opened.control.navigationGeneration);
    expect(reacquired.control.controlEpoch).toBeGreaterThan(opened.control.controlEpoch);
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });
  });

  it("rejects negative dispatcher lifecycle epochs without invalidating control", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });

    expect(() => fixture.dispatcher.controlChanged(
      opened.target.windowId,
      opened.target.tabId,
      -1,
    )).toThrow(/control epoch/i);
    expect(() => fixture.dispatcher.navigationChanged(
      opened.target.windowId,
      opened.target.tabId,
      -1,
      0,
    )).toThrow(/navigation generation/i);
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).resolves.toEqual({ action: "read" });
  });

  it.each(["session_save", "session_load", "execute_js"])(
    "reports %s honestly unavailable without fallback execution",
    async (action) => {
      const fixture = createFixture();
      const opened = await fixture.dispatch("connection-one", {
        request: { action: "open", url: "https://example.com" },
      });
      const request = action === "execute_js"
        ? { action, source: "document.title" }
        : { action, name: "research" };
      await expect(fixture.dispatch("connection-one", {
        control: opened.control,
        request,
      })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
      expect(fixture.executor.execute).not.toHaveBeenCalled();
    },
  );

  it("keeps public execute_js capability-gated even when given an approval identifier", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-eval", {
      request: { action: "open", url: "https://example.com" },
    });
    await expect(fixture.dispatch("connection-eval", {
      approvalId: "approval-forged",
      control: opened.control,
      request: { action: "execute_js", source: "document.cookie" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
    expect(fixture.executor.execute).not.toHaveBeenCalled();
  });

  it("keeps session_save/session_load gated until session capabilities are verified", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-session", {
      request: { action: "open", url: "https://example.com" },
    });
    for (const action of ["session_save", "session_load"] as const) {
      await expect(fixture.dispatch("connection-session", {
        control: opened.control,
        request: { action, name: "research" },
      })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    }
    expect(fixture.executor.execute).not.toHaveBeenCalled();
  });

  it("returns opaque session summaries and hard-denies execute_js on session-injected tabs", async () => {
    const { createBrowserSessionCapabilities } = require(
      "../../../../electron/browser/browser-session-capabilities.cjs",
    );
    const fixture = createFixture();
    const sessionCapabilities = createBrowserSessionCapabilities({
      cookieReplay: true,
      localStorageReplay: true,
      namedProfiles: true,
    });
    const sessionService = {
      clearTabSessionInjected: vi.fn(),
      isSessionInjected: vi.fn(() => false),
      load: vi.fn(async () => {
        sessionService.isSessionInjected = vi.fn(() => true);
        return Object.freeze({
          capabilities: sessionCapabilities.snapshot(),
          loaded: true,
          name: "research",
        });
      }),
      save: vi.fn(async () => Object.freeze({
        capabilities: sessionCapabilities.snapshot(),
        cookieCount: 2,
        localStorageItemCount: 3,
        name: "research",
        originCount: 1,
      })),
    };
    const dispatcher = createBrowserCommandDispatcher({
      approvals: fixture.approvals,
      createAiSandboxTarget: fixture.createAiSandboxTarget,
      destroyTarget: fixture.destroyTarget,
      executor: fixture.executor,
      leases: fixture.leases,
      navigationPolicy: createBrowserNavigationPolicy({
        allowLoopback: true,
        resolveDns: async () => ["93.184.216.34"],
      }),
      partitionSelector: fixture.partitionSelector,
      registry: fixture.registry,
      sessionCapabilities,
      sessionService,
    });
    const dispatch = (connectionId: string, params: Record<string, unknown>) =>
      dispatcher.dispatch({
        connectionId,
        method: "browser.mcp.action",
        params: { actionTimeoutMs: 12_000, ...params },
        signal: new AbortController().signal,
      });
    const opened = await dispatch("connection-session-ok", {
      request: { action: "open", url: "https://example.com" },
    });
    const required = await dispatch("connection-session-ok", {
      control: opened.control,
      request: { action: "session_save", name: "research" },
    }).catch((error: { code?: string; metadata?: { approvalId?: string } }) => error);
    expect(required).toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approvalId = required.metadata?.approvalId as string;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    const saved = await dispatch("connection-session-ok", {
      approvalId,
      control: opened.control,
      request: { action: "session_save", name: "research" },
    });
    expect(saved).toEqual({
      capabilities: {
        cookieReplay: true,
        localStorageReplay: true,
        namedProfiles: true,
      },
      cookieCount: 2,
      localStorageItemCount: 3,
      name: "research",
      originCount: 1,
    });
    expect(JSON.stringify(saved)).not.toContain("super-secret");
    expect(saved).not.toHaveProperty("cookies");
    expect(saved).not.toHaveProperty("origins");
    expect(fixture.executor.execute).not.toHaveBeenCalled();

    const loadRequired = await dispatch("connection-session-ok", {
      control: opened.control,
      request: { action: "session_load", name: "research" },
    }).catch((error: { code?: string; metadata?: { approvalId?: string } }) => error);
    expect(loadRequired).toMatchObject({ code: "APPROVAL_REQUIRED" });
    const loadApprovalId = loadRequired.metadata?.approvalId as string;
    fixture.approvals.resolve({
      approvalId: loadApprovalId,
      decision: "allow_once",
      windowId: opened.target.windowId,
    });
    await dispatch("connection-session-ok", {
      approvalId: loadApprovalId,
      control: opened.control,
      request: { action: "session_load", name: "research" },
    });
    await expect(dispatch("connection-session-ok", {
      control: opened.control,
      request: { action: "execute_js", source: "document.cookie" },
    })).rejects.toMatchObject({
      code: "CAPABILITY_NOT_VERIFIED",
      metadata: expect.objectContaining({ capability: "execute_js-session-injected" }),
    });
  });

  it("requires a token to release and accepts a repeated release by the same owner", async () => {
    const fixture = createFixture();
    const opened = await fixture.dispatch("connection-one", {
      request: { action: "open", url: "https://example.com" },
    });
    const release = { control: opened.control, request: { action: "release_control" } };
    await expect(fixture.dispatch("connection-one", {
      request: { action: "release_control" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(fixture.dispatch("connection-one", release)).resolves.toEqual({ released: true });
    await expect(fixture.dispatch("connection-one", release)).resolves.toEqual({ released: false });
    await expect(fixture.dispatch("connection-one", {
      control: opened.control,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });
  });

  it("rejects replay after navigation, tab close, window close, and disconnect", async () => {
    const cases = [
      (fixture: ReturnType<typeof createFixture>, opened: OpenedTarget) => {
        fixture.registry.commitNavigation(opened.target.windowId, opened.target.tabId, {
          url: "https://example.com/next",
        });
        fixture.dispatcher.navigationChanged(opened.target.windowId, opened.target.tabId, 1);
      },
      (fixture: ReturnType<typeof createFixture>, opened: OpenedTarget) => {
        fixture.registry.closeTab(opened.target.windowId, opened.target.tabId);
        fixture.dispatcher.tabClosed(opened.target.windowId, opened.target.tabId);
      },
      (fixture: ReturnType<typeof createFixture>, opened: OpenedTarget) => {
        fixture.registry.closeWindow(opened.target.windowId);
        fixture.dispatcher.windowClosed(opened.target.windowId);
      },
      (fixture: ReturnType<typeof createFixture>) => fixture.dispatcher.releaseOwnership("connection-one"),
    ];
    for (const invalidate of cases) {
      const fixture = createFixture();
      const opened = await fixture.dispatch("connection-one", {
        request: { action: "open", url: "https://example.com" },
      });
      invalidate(fixture, opened as OpenedTarget);
      await expect(fixture.dispatch("connection-one", {
        control: opened.control,
        request: { action: "read" },
      })).rejects.toMatchObject({
        code: expect.stringMatching(/LEASE_LOST|TAB_NOT_FOUND|WINDOW_NOT_FOUND|STALE_NAVIGATION/),
      });
    }
  });
});
