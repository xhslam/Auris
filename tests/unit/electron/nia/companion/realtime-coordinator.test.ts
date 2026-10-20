import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRealtimeCoordinator } = require("../../../../../electron/nia/companion/realtime-coordinator.cjs");
const { createConversationLifecycle } = require("../../../../../electron/nia/companion/conversation-lifecycle.cjs");

function setup(options: { initialConversationSaving?: boolean; saveConversationSaving?: (enabled: boolean) => void } = {}) {
  const sent: unknown[] = [];
  let live = false;
  const conversation = {
    file: vi.fn(() => { live = true; return true; }),
    tool: vi.fn(),
    end: vi.fn(() => { live = false; }),
    isLive: vi.fn(() => live),
    setSaving: vi.fn(),
  };
  const diagnostics = { note: vi.fn() };
  const credentialBroker = { read: vi.fn(async () => ({ ok: true, credential: { type: "codex-oauth" } })) };
  const transport = { send: vi.fn((command: unknown) => { sent.push(command); }) };
  const timers: Array<{ at: number; cb: () => void }> = [];
  let clock = 1000;
  const coordinator = createRealtimeCoordinator({ credentialBroker, transport, conversation, diagnostics, now: () => clock, setTimeoutImpl: (cb: () => void, ms: number) => { timers.push({ at: clock + ms, cb }); return timers.length; }, clearTimeoutImpl: () => undefined, rotationLeadMs: 100, ...options });
  return { coordinator, conversation, credentialBroker, diagnostics, sent, timers, setClock: (value: number) => { clock = value; } };
}

describe("Nia realtime coordinator", () => {
  it("opens once, rejects stale reports and forwards a queued typed message", async () => {
    const s = setup();
    await s.coordinator.wake();
    expect(s.sent).toEqual([{ type: "open", generation: 1, reason: "wake", credential: { type: "codex-oauth" }, personaId: "nia" }]);
    expect(s.coordinator.report({ type: "opened", generation: 0, sessionId: "stale" })).toBe(false);
    s.coordinator.sendText("hello");
    expect(s.coordinator.snapshot().pendingText).toBe(true);
    s.coordinator.report({ type: "opened", generation: 1, sessionId: "s-1", expiresAt: 5000 });
    expect(s.sent.at(-1)).toEqual({ type: "text", generation: 1, text: "hello" });
    expect(s.coordinator.snapshot().sessionId).toBe("s-1");
  });

  it("files reports, queues pre-turn tools, and closes on rest", () => {
    const s = setup();
    s.coordinator.report({ type: "opened", generation: 0, sessionId: "s-1" });
    expect(s.coordinator.report({ type: "tool", generation: 0, name: "list_due_reviews", callId: "call-1" })).toMatchObject({ state: "listening" });
    expect(s.coordinator.report({ type: "heard", generation: 0, text: "开始", at: 10 })).toBeTruthy();
    expect(s.conversation.tool).toHaveBeenCalledWith("list_due_reviews", "call-1", "arrived", expect.any(Number));
    expect(s.conversation.file).toHaveBeenCalledWith("user", "开始", expect.objectContaining({ at: 10 }));
    s.coordinator.rest();
    expect(s.sent.at(-1)).toMatchObject({ type: "close", reason: "user" });
    expect(s.conversation.end).not.toHaveBeenCalled();
    expect(s.coordinator.report({ type: "said", generation: 0, text: "最后一句", at: 11 })).toBeTruthy();
    expect(s.coordinator.report({ type: "closed", generation: 0, at: 12 })).toBeTruthy();
    expect(s.conversation.file).toHaveBeenLastCalledWith("nia", "最后一句", expect.objectContaining({ at: 11 }));
    expect(s.conversation.end).toHaveBeenCalledWith(12);
  });

  it("ends after the close grace period when the renderer cannot acknowledge", () => {
    const s = setup();
    s.coordinator.report({ type: "heard", generation: 0, text: "在吗", at: 10 });
    s.coordinator.rest();
    expect(s.conversation.end).not.toHaveBeenCalled();
    const closeTimer = s.timers.at(-1);
    expect(closeTimer?.at).toBe(4_000);
    s.setClock(4_000);
    closeTimer?.cb();
    expect(s.conversation.end).toHaveBeenCalledWith(4_000);
  });

  it("cancels a wake still waiting for credentials when rest is requested", async () => {
    const s = setup();
    let resolveAuth!: (value: { ok: boolean; credential: { type: string } }) => void;
    s.credentialBroker.read.mockImplementationOnce(() => new Promise((resolve) => { resolveAuth = resolve; }));
    const wake = s.coordinator.wake();
    s.coordinator.rest();
    resolveAuth({ ok: true, credential: { type: "codex-oauth" } });
    expect(await wake).toBe(false);
    expect(s.sent).toEqual([{ type: "close", generation: 1, reason: "user" }]);
    expect(s.coordinator.snapshot().state).toBe("resting");
  });

  it("rejects stale opened/state reports during closing and every old report after grace", async () => {
    const s = setup();
    await s.coordinator.wake();
    s.coordinator.report({ type: "opened", generation: 1, sessionId: "old" });
    s.coordinator.rest();
    expect(s.coordinator.report({ type: "opened", generation: 1, sessionId: "late" })).toBe(false);
    expect(s.coordinator.report({ type: "state", generation: 1, state: "listening" })).toBe(false);
    expect(s.coordinator.report({ type: "said", generation: 1, text: "末句" })).toBeTruthy();
    s.timers.at(-1)?.cb();
    for (const type of ["opened", "heard", "said", "tool", "closed"]) {
      expect(s.coordinator.report({ type, generation: 1, text: "太迟" })).toBe(false);
    }
    expect(s.coordinator.snapshot().state).toBe("resting");
  });

  it("does not let a previous close or close timer stop a new wake", async () => {
    const s = setup();
    await s.coordinator.wake();
    s.coordinator.report({ type: "heard", generation: 1, text: "上一轮" });
    s.coordinator.rest();
    const oldTimer = s.timers.at(-1);
    s.coordinator.rest(); // Repeated stops must not replace the closing generation.
    expect(s.coordinator.report({ type: "said", generation: 1, text: "上一轮末句" })).toBeTruthy();
    const nextWake = s.coordinator.wake();
    expect(s.credentialBroker.read).toHaveBeenCalledTimes(1);
    expect(s.coordinator.report({ type: "said", generation: 1, text: "wake 请求后的末句" })).toBeTruthy();
    s.coordinator.report({ type: "closed", generation: 1 });
    await nextWake;
    const nextGeneration = s.coordinator.snapshot().generation;
    s.coordinator.report({ type: "opened", generation: nextGeneration, sessionId: "new" });
    s.coordinator.report({ type: "heard", generation: nextGeneration, text: "新一轮" });
    expect(s.coordinator.report({ type: "closed", generation: 1 })).toBe(false);
    oldTimer?.cb();
    expect(s.coordinator.snapshot()).toMatchObject({ state: "listening", sessionId: "new" });
    expect(s.conversation.end).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued reopen with another rest and releases it after close grace", async () => {
    const s = setup();
    await s.coordinator.wake();
    s.coordinator.rest();
    const reopened = s.coordinator.wake();
    s.coordinator.rest();
    s.timers.at(-1)?.cb();
    expect(await reopened).toBe(false);
    expect(s.credentialBroker.read).toHaveBeenCalledTimes(1);
    expect(s.coordinator.snapshot().state).toBe("resting");
  });

  it("reopens after grace when the renderer cannot close, without carrying empty-session tools", async () => {
    const rows: string[] = [];
    const conversation = createConversationLifecycle({ personaId: "nia", store: {
      begin: () => "new-conversation", say: () => true, end: () => undefined,
      tool: ({ name }: { name: string }) => { rows.push(name); return true; },
    } });
    const timers: Array<() => void> = [];
    const coordinator = createRealtimeCoordinator({ credentialBroker: { read: async () => ({ ok: true, credential: {} }) }, transport: { send: () => undefined }, conversation,
      setTimeoutImpl: (cb: () => void) => { timers.push(cb); return timers.length; }, clearTimeoutImpl: () => undefined,
    });
    await coordinator.wake();
    coordinator.report({ type: "tool", generation: 1, name: "old-tool", callId: "old" });
    coordinator.rest();
    const reopen = coordinator.wake();
    timers.at(-1)?.();
    expect(await reopen).toBe(true);
    coordinator.report({ type: "heard", generation: coordinator.snapshot().generation, text: "新会话" });
    expect(rows).toEqual([]);
    coordinator.dispose();
  });

  it("arms rotation before expiry and never falls back to another provider", async () => {
    const s = setup();
    await s.coordinator.wake();
    s.coordinator.report({ type: "opened", generation: 1, sessionId: "s-1", expiresAt: 5000 });
    expect(s.timers).toHaveLength(1);
    expect(s.coordinator.sendText("a")).toBe(true);
    expect(s.credentialBroker.read).toHaveBeenCalledTimes(1);
    expect(s.coordinator.snapshot().state).toBe("listening");
  });

  it("loads and persists the conversation-saving preference before any wake", () => {
    const saveConversationSaving = vi.fn();
    const s = setup({ initialConversationSaving: false, saveConversationSaving });

    expect(s.coordinator.snapshot().savingConversations).toBe(false);
    expect(s.conversation.setSaving).toHaveBeenCalledWith(false);

    expect(s.coordinator.setConversationSaving(true)).toBe(true);
    expect(saveConversationSaving).toHaveBeenCalledWith(true);
  });
});
