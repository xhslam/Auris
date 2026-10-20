import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  COMMAND_CHANNEL,
  EVENT_CHANNEL,
  REPORT_CHANNEL,
  createCompanionIpc,
} = require("../../../../../electron/nia/companion/companion-ipc.cjs");

function fakeIpcMain() {
  type Handler = (...args: unknown[]) => unknown;
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Handler>();
  return {
    handlers,
    listeners,
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: Handler) => listeners.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    removeListener: vi.fn((channel: string) => listeners.delete(channel)),
  };
}

describe("Nia companion IPC", () => {
  it("keeps credential/session keys in main and exposes only an opaque handle", async () => {
    const ipcMain = fakeIpcMain();
    const sent: unknown[] = [];
    const window = { window: () => ({ webContents: { send: (_channel: string, value: unknown) => sent.push(value) } }) };
    const credential = Object.freeze({ type: "codex-oauth" });
    const session = Object.freeze({ type: "realtime-session" });
    const service = createCompanionIpc({
      ipcMain,
      companionWindow: window,
      isTrustedSender: () => true,
      readCredential: vi.fn(async () => ({ ok: true, credential })),
      exchangeRealtimeSession: vi.fn(async ({ credential: value }: { credential: unknown }) => {
        expect(value).toBe(credential);
        return { ok: true, session, model: "gpt-realtime-2.1", expiresAt: Date.now() + 60_000 };
      }),
      proxyRealtimeSdp: vi.fn(async ({ session: value }: { session: unknown }) => {
        expect(value).toBe(session);
        return { ok: true, answer: "v=0" };
      }),
    });
    service.register();
    const event = { sender: {} };
    const open = await ipcMain.handlers.get(COMMAND_CHANNEL)!(event, { command: "open-session", payload: {} });
    if (typeof open !== "object" || open === null || !("ok" in open) || !("sessionId" in open) || typeof open.sessionId !== "string") {
      throw new Error("Expected an opaque successful session response");
    }
    expect(open.ok).toBe(true);
    expect(open.sessionId).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(JSON.stringify(open)).not.toContain("realtime-session");
    expect(service.sessionCount()).toBe(1);
    const sdp = await ipcMain.handlers.get(COMMAND_CHANNEL)!(event, { command: "sdp", payload: { sessionId: open.sessionId, offer: "v=0" } });
    expect(sdp).toEqual({ ok: true, answer: "v=0" });
    expect(service.sessionCount()).toBe(0);
    const replay = await ipcMain.handlers.get(COMMAND_CHANNEL)!(event, { command: "sdp", payload: { sessionId: open.sessionId, offer: "v=0" } });
    expect(replay).toMatchObject({ ok: false, error: { code: "REALTIME_SESSION_INVALID" } });
    expect(sent).toHaveLength(0);
    service.send({ type: "opened", generation: 1, sessionId: open.sessionId });
    expect(sent).toEqual([{ type: "opened", generation: 1, sessionId: open.sessionId }]);
  });

  it("rejects an expired session handle before proxying SDP", async () => {
    const ipcMain = fakeIpcMain();
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const proxyRealtimeSdp = vi.fn(async () => ({ ok: true, answer: "v=0" }));
    try {
      const service = createCompanionIpc({
        ipcMain, companionWindow: { window: () => null }, isTrustedSender: () => true,
        readCredential: async () => ({ ok: true, credential: {} }),
        exchangeRealtimeSession: async () => ({ ok: true, session: {}, expiresAt: now + 1_000 }),
        proxyRealtimeSdp,
      });
      service.register();
      const command = ipcMain.handlers.get(COMMAND_CHANNEL)!;
      const opened = await command({}, { command: "open-session" }) as { sessionId: string };
      now += 1_001;
      expect(await command({}, { command: "sdp", payload: { sessionId: opened.sessionId, offer: "v=0" } })).toMatchObject({ ok: false, error: { code: "REALTIME_SESSION_INVALID" } });
      expect(proxyRealtimeSdp).not.toHaveBeenCalled();
      expect(service.sessionCount()).toBe(0);
    } finally { clock.mockRestore(); }
  });

  it("rejects untrusted commands and forwards only validated reports", async () => {
    const ipcMain = fakeIpcMain();
    const onReport = vi.fn();
    const service = createCompanionIpc({
      ipcMain,
      companionWindow: { window: () => null },
      isTrustedSender: () => false,
      readCredential: async () => ({ ok: false }),
      exchangeRealtimeSession: async () => ({ ok: false }),
      proxyRealtimeSdp: async () => ({ ok: false }),
      onReport,
    });
    service.register();
    await expect(ipcMain.handlers.get(COMMAND_CHANNEL)!({ sender: {} }, { command: "snapshot" })).rejects.toThrow("Untrusted");
    const accepted = ipcMain.listeners.get(REPORT_CHANNEL)!({ sender: {} }, { type: "opened" });
    expect(accepted).toBe(false);
    expect(onReport).not.toHaveBeenCalled();
    expect(ipcMain.listeners.has(`${REPORT_CHANNEL}:ready`)).toBe(true);
    expect(EVENT_CHANNEL).toBe("auris:nia-companion:event");
  });

  it("routes the companion right-click request only from its trusted renderer", async () => {
    const ipcMain = fakeIpcMain();
    const onMenu = vi.fn(() => true);
    const service = createCompanionIpc({
      ipcMain,
      companionWindow: { window: () => null },
      isTrustedSender: () => true,
      readCredential: async () => ({ ok: false }),
      exchangeRealtimeSession: async () => ({ ok: false }),
      proxyRealtimeSdp: async () => ({ ok: false }),
      onMenu,
    });
    service.register();
    await expect(ipcMain.handlers.get(COMMAND_CHANNEL)!({ sender: {} }, { command: "menu" })).resolves.toBe(true);
    expect(onMenu).toHaveBeenCalledOnce();
  });

  it("forwards drag-end payload with retainCapture option to companion window", async () => {
    const ipcMain = fakeIpcMain();
    const endDrag = vi.fn((payload?: unknown) => true);
    const service = createCompanionIpc({
      ipcMain,
      companionWindow: { window: () => null, endDrag },
      isTrustedSender: () => true,
      readCredential: async () => ({ ok: false }),
      exchangeRealtimeSession: async () => ({ ok: false }),
      proxyRealtimeSdp: async () => ({ ok: false }),
    });
    service.register();
    await expect(
      ipcMain.handlers.get(COMMAND_CHANNEL)!({ sender: {} }, { command: "drag-end", payload: { retainCapture: true } }),
    ).resolves.toBe(true);
    expect(endDrag).toHaveBeenCalledWith({ retainCapture: true });
  });
});
