import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  NIA_COMMAND_CHANNEL,
  NIA_EVENT_CHANNEL,
  NiaIpcError,
  createNiaIpc,
} = require("../../../../electron/nia/nia-ipc.cjs");

function createWebContents(id: number) {
  const webContents = new EventEmitter() as EventEmitter & {
    id: number;
    send: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
  };
  webContents.id = id;
  webContents.send = vi.fn();
  webContents.isDestroyed = vi.fn(() => false);
  return webContents;
}

function createFixture() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const subscriptions = new Map<number, (event: unknown) => void>();
  const runtime = {
    startRun: vi.fn(async ({ ownerWebContentsId }: { ownerWebContentsId: number }) => ({
      runId: `run-${ownerWebContentsId}`,
    })),
    cancelRun: vi.fn(({ runId, ownerWebContentsId }: { runId: string; ownerWebContentsId: number }) => ({
      runId,
      ownerWebContentsId,
      cancelled: true,
    })),
    getRun: vi.fn(({ runId, ownerWebContentsId }: { runId: string; ownerWebContentsId: number }) => ({
      runId,
      ownerWebContentsId,
      status: "started",
    })),
    cancelAllForOwner: vi.fn(),
    subscribe: vi.fn((ownerId: number, listener: (event: unknown) => void) => {
      subscriptions.set(ownerId, listener);
      return () => subscriptions.delete(ownerId);
    }),
    modelDiscovery: {
      discoverCli: vi.fn(),
      discoverRestModels: vi.fn(),
      testCliConnection: vi.fn(),
      testRestConnection: vi.fn(),
    },
  };
  const providerStore = {
    readPersistedConfig: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    upsertRestProvider: vi.fn(async (input: Record<string, unknown>) => input),
    upsertCliProvider: vi.fn(async (input: Record<string, unknown>) => input),
    setSessionApiKey: vi.fn(),
    clearSessionApiKey: vi.fn(),
    getSessionApiKey: vi.fn(() => null),
    setActiveDefault: vi.fn(async (id: string) => id),
    rememberOnThisMac: vi.fn(async () => ({ id: "p1" })),
  };
  // 定义存储的假实现。`list()` 返回带 body 的完整描述符，因为被测行为正是
   // 「列表投影必须丢掉 body」——如果 fixture 先把 body 去掉，这条断言就永远
   // 通过而什么也没验证。
  const definitionStore = {
    list: vi.fn(async () => [
      {
        body: "a".repeat(5_000),
        canonicalId: "improve-clarity",
        category: "editing",
        description: "Improve clarity.",
        diagnostics: ["internal-only"],
        label: "Nia",
        provenance: "built-in",
        scope: "selection",
        sourceCompatibility: "canonical_v1",
      },
    ]),
    get: vi.fn(async (canonicalId: string) =>
      canonicalId === "improve-clarity"
        ? {
            body: "full prompt body",
            canonicalId,
            description: "Improve clarity.",
            label: "Nia",
            provenance: "built-in",
            scope: "selection",
            sourceCompatibility: "canonical_v1",
          }
        : null,
    ),
  };
  const niaIpc = createNiaIpc({
    ipcMain,
    runtime,
    providerStore,
    definitionStore,
    resolveCallerKind: (event: { callerKind?: string }) => event.callerKind,
  });
  return {
    definitionStore,
    handlers,
    ipcMain,
    niaIpc,
    providerStore,
    runtime,
    subscriptions,
  };
}

/** 无定义存储的变体：非 Notes 宿主可以不带它构造 IPC。 */
function createFixtureWithoutDefinitions() {
  const ipcMain = {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  };
  const niaIpc = createNiaIpc({
    ipcMain,
    runtime: { startRun: vi.fn(), cancelAllForOwner: vi.fn(), subscribe: vi.fn(() => () => undefined) },
    resolveCallerKind: (event: { callerKind?: string }) => event.callerKind,
  });
  return { niaIpc };
}

describe("Nia provider IPC", () => {
  it("registers one fixed channel and binds start ownership to event.sender", async () => {
    const fixture = createFixture();
    expect(fixture.niaIpc.register()).toBe(true);
    expect(fixture.niaIpc.register()).toBe(false);
    expect(fixture.ipcMain.handle).toHaveBeenCalledWith(
      NIA_COMMAND_CHANNEL,
      expect.any(Function),
    );

    const sender = createWebContents(41);
    const result = await fixture.niaIpc.handleCommand(
      { sender, callerKind: "notes" },
      { command: "start", payload: { prompt: "hello" } },
    );
    expect(result).toEqual({ runId: "run-41" });
    expect(fixture.runtime.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ ownerWebContentsId: 41, prompt: "hello" }),
    );

    await fixture.niaIpc.handleCommand(
      { sender, callerKind: "browser-chrome" },
      {
        command: "start",
        payload: {
          prompt: "browse",
          enableBrowserTools: true,
          browserTarget: { windowId: "w1", tabId: "t1" },
        },
      },
    );
    expect(fixture.runtime.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerWebContentsId: 41,
        prompt: "browse",
        enableBrowserTools: true,
        browserTarget: { windowId: "w1", tabId: "t1" },
      }),
    );

    await expect(
      fixture.niaIpc.handleCommand(
        { sender, callerKind: "notes" },
        { command: "start", payload: { prompt: "hello", ownerWebContentsId: 999 } },
      ),
    ).rejects.toThrow(/Unknown Nia command key/u);
  });

  it("rejects untrusted callers and always uses the current sender for cancel/getRun", async () => {
    const fixture = createFixture();
    const owner = createWebContents(7);
    const other = createWebContents(8);

    await expect(
      fixture.niaIpc.handleCommand(
        { sender: owner, callerKind: "page" },
        { command: "start", payload: { prompt: "no" } },
      ),
    ).rejects.toBeInstanceOf(NiaIpcError);

    await fixture.niaIpc.handleCommand(
      { sender: other, callerKind: "browser-chrome" },
      { command: "cancel", payload: { runId: "run-7" } },
    );
    expect(fixture.runtime.cancelRun).toHaveBeenCalledWith({
      runId: "run-7",
      ownerWebContentsId: 8,
    });
  });

  it("delivers events only to the subscribed owner and cancels runs on navigation/destroy", async () => {
    const fixture = createFixture();
    const sender = createWebContents(15);
    const event = { sender, callerKind: "browser-chrome" };

    expect(
      await fixture.niaIpc.handleCommand(event, { command: "subscribe", payload: {} }),
    ).toBe(true);
    fixture.subscriptions.get(15)?.({ type: "delta", runId: "r", text: "x" });
    expect(sender.send).toHaveBeenCalledWith(
      NIA_EVENT_CHANNEL,
      expect.objectContaining({ type: "delta", text: "x" }),
    );

    sender.emit("did-navigate");
    expect(fixture.runtime.cancelAllForOwner).toHaveBeenCalledWith(15, {
      dropSubscribers: false,
    });
    expect(fixture.subscriptions.has(15)).toBe(true);

    sender.emit("destroyed");
    expect(fixture.runtime.cancelAllForOwner).toHaveBeenCalledWith(15);
    expect(fixture.subscriptions.has(15)).toBe(false);
  });

  it("upserts REST providers without plaintext secrets and stores session keys separately", async () => {
    const fixture = createFixture();
    const sender = createWebContents(21);
    const event = { sender, callerKind: "browser-chrome" };
    const draft = {
      id: "anthropic-default",
      kind: "rest",
      protocol: "anthropic",
      label: "Anthropic",
      enabled: true,
      endpoint: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      supportedModels: ["claude-sonnet-4-5"],
      capabilities: {
        streaming: true,
        toolModeDisable: true,
        cancellation: true,
        attachments: false,
        maxInputTokens: 128_000,
        maxOutputTokens: 8_192,
      },
      bounds: { timeoutMs: 60_000, maxOutputBytes: 1_048_576 },
    };
    fixture.providerStore.readPersistedConfig.mockResolvedValue({
      activeProviderId: "anthropic-default",
      providers: [{ ...draft, rememberOnThisMac: false, secretRef: null }],
    });

    await expect(
      fixture.niaIpc.handleCommand(event, {
        command: "upsertRestProvider",
        payload: { ...draft, apiKey: "sk-secret" },
      }),
    ).rejects.toThrow(/plaintext secret/u);

    await fixture.niaIpc.handleCommand(event, { command: "upsertRestProvider", payload: draft });
    expect(fixture.providerStore.upsertRestProvider).toHaveBeenCalledWith(draft);

    await fixture.niaIpc.handleCommand(event, {
      command: "setSessionApiKey",
      payload: { providerId: "anthropic-default", apiKey: "sk-live" },
    });
    expect(fixture.providerStore.setSessionApiKey).toHaveBeenCalledWith("anthropic-default", "sk-live");

    await fixture.niaIpc.handleCommand(event, {
      command: "rememberOnThisMac",
      payload: { providerId: "anthropic-default", remember: true },
    });
    expect(fixture.providerStore.rememberOnThisMac).toHaveBeenCalledWith("anthropic-default", true);
  });
});

/**
 * 定义读取命令。
 *
 * 这两条命令是选择器（picker）能存在的前提：在它们之前，定义存储只被
 * workflow 子系统当作 step 仓库使用，渲染层根本没有「列出可用动作」的通道。
 */
describe("Nia definition IPC", () => {
  const event = { callerKind: "notes", sender: createWebContents(11) };

  it("lists definitions without shipping prompt bodies over IPC", async () => {
    const fixture = createFixture();

    const result = (await fixture.niaIpc.handleCommand(event, {
      command: "listDefinitions",
      payload: {},
    })) as { definitions: Array<Record<string, unknown>> };

    expect(result.definitions).toHaveLength(1);
    const [summary] = result.definitions;
    // body 上限 200KB/条，列表一次性带上会把打开选择器变成几 MB 的结构化克隆。
    expect(summary.body).toBeUndefined();
    // diagnostics 是内部解析诊断，不该出现在 UI 列表里。
    expect(summary.diagnostics).toBeUndefined();
    expect(summary).toMatchObject({
      canonicalId: "improve-clarity",
      category: "editing",
      description: "Improve clarity.",
      label: "Nia",
      provenance: "built-in",
      scope: "selection",
    });
  });

  it("returns the full record, body included, for a single definition", async () => {
    const fixture = createFixture();

    const record = (await fixture.niaIpc.handleCommand(event, {
      command: "getDefinition",
      payload: { canonicalId: "improve-clarity" },
    })) as Record<string, unknown>;

    expect(record.body).toBe("full prompt body");
    expect(fixture.definitionStore.get).toHaveBeenCalledWith("improve-clarity");
  });

  it("returns null for an unknown definition instead of throwing", async () => {
    const fixture = createFixture();

    await expect(
      fixture.niaIpc.handleCommand(event, {
        command: "getDefinition",
        payload: { canonicalId: "does-not-exist" },
      }),
    ).resolves.toBeNull();
  });

  it("rejects a definition request with unknown keys", async () => {
    const fixture = createFixture();

    await expect(
      fixture.niaIpc.handleCommand(event, {
        command: "getDefinition",
        payload: { canonicalId: "improve-clarity", baseDir: "/etc" },
      }),
    ).rejects.toThrow(/Unknown/u);
  });

  it("requires a non-empty canonicalId", async () => {
    const fixture = createFixture();

    await expect(
      fixture.niaIpc.handleCommand(event, {
        command: "getDefinition",
        payload: { canonicalId: "" },
      }),
    ).rejects.toThrow(/canonicalId is required/u);
  });

  it("reports an empty list when no definition store is wired", async () => {
    const { niaIpc } = createFixtureWithoutDefinitions();

    // 空列表而不是抛错：选择器据此显示「没有可用动作」，而不是弹一个用户
    // 无法处理的错误。
    await expect(
      niaIpc.handleCommand(event, { command: "listDefinitions", payload: {} }),
    ).resolves.toEqual({ definitions: [] });
  });

  it("refuses definition reads from an untrusted caller", async () => {
    const fixture = createFixture();

    await expect(
      fixture.niaIpc.handleCommand(
        { callerKind: "unknown-window", sender: createWebContents(12) },
        { command: "listDefinitions", payload: {} },
      ),
    ).rejects.toThrow(NiaIpcError);
    expect(fixture.definitionStore.list).not.toHaveBeenCalled();
  });
});
