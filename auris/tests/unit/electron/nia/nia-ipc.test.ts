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
  const niaIpc = createNiaIpc({
    ipcMain,
    runtime,
    providerStore,
    resolveCallerKind: (event: { callerKind?: string }) => event.callerKind,
  });
  return { handlers, ipcMain, niaIpc, providerStore, runtime, subscriptions };
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
