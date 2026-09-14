import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  NIA_COMPANION_HOST_COMMANDS,
  createNiaCompanionHostDispatcher,
} = require("../../../../../electron/nia/companion/companion-answers.cjs");

describe("Nia companion answers contract and dispatcher", () => {
  it("defines the exact 11 host commands in the contract", () => {
    expect(NIA_COMPANION_HOST_COMMANDS).toEqual([
      "snapshot",
      "conversations",
      "conversation-turns",
      "conversation-detail",
      "conversation-search",
      "conversation-saving",
      "wake",
      "rest",
      "mute",
      "companion-visibility",
      "text",
    ]);
  });

  it("returns resting state if coordinator is unavailable", async () => {
    const dispatch = createNiaCompanionHostDispatcher({
      getCoordinator: () => null,
    });
    const result = await dispatch({ command: "snapshot" });
    expect(result).toEqual({ state: "resting" });
  });

  it("answers snapshot with coordinator snapshot and window visibility", async () => {
    const coordinator = {
      snapshot: () => ({ state: "attending", muted: false }),
    };
    const window = {
      isVisible: () => true,
    };
    const dispatch = createNiaCompanionHostDispatcher({
      getCoordinator: () => coordinator,
      getWindow: () => window,
    });
    const result = await dispatch({ command: "snapshot" });
    expect(result).toEqual({ state: "attending", muted: false, visible: true });
  });

  it("answers conversations, turns, detail, and search with structured shapes", async () => {
    const store = {
      list: vi.fn(() => [{ id: "c1", startedAt: "2026-09-02T10:00:00Z" }]),
      turns: vi.fn(() => [{ id: "t1", text: "hello", speaker: "user" }]),
      tools: vi.fn(() => [{ callId: "tool1", name: "recall", status: "ok" }]),
      search: vi.fn(() => [{ conversationId: "c1", turnId: "t1", text: "hello" }]),
    };
    const coordinator = { snapshot: () => ({ state: "resting" }) };
    const dispatch = createNiaCompanionHostDispatcher({
      getCoordinator: () => coordinator,
      getConversationStore: () => store,
    });

    const convs = await dispatch({ command: "conversations" });
    expect(convs).toEqual([{ id: "c1", startedAt: "2026-09-02T10:00:00Z" }]);

    const turns = await dispatch({
      command: "conversation-turns",
      payload: { conversationId: "c1" },
    });
    expect(turns).toEqual([{ id: "t1", text: "hello", speaker: "user" }]);

    const detail = await dispatch({
      command: "conversation-detail",
      payload: { conversationId: "c1" },
    });
    expect(detail).toEqual({
      tools: [{ callId: "tool1", name: "recall", status: "ok" }],
      turns: [{ id: "t1", text: "hello", speaker: "user" }],
    });

    const search = await dispatch({
      command: "conversation-search",
      payload: { query: "hello" },
    });
    expect(search).toEqual([{ conversationId: "c1", turnId: "t1", text: "hello" }]);
  });

  it("answers actions like wake, rest, mute, text, and companion-visibility", async () => {
    const coordinator = {
      snapshot: () => ({ state: "resting" }),
      open: vi.fn(() => Promise.resolve(true)),
      rest: vi.fn(() => Promise.resolve(true)),
      setMuted: vi.fn((muted: boolean) => muted),
      setConversationSaving: vi.fn((enabled: boolean) => enabled),
      sendText: vi.fn((text: string) => Promise.resolve({ ok: true, text })),
    };
    const window = {
      show: vi.fn(),
      hide: vi.fn(),
    };
    const sendHostEvent = vi.fn();
    const dispatch = createNiaCompanionHostDispatcher({
      getCoordinator: () => coordinator,
      getWindow: () => window,
      sendHostEvent,
    });

    await expect(dispatch({ command: "wake" })).resolves.toBe(true);
    await expect(dispatch({ command: "rest" })).resolves.toBe(true);
    await expect(
      dispatch({ command: "mute", payload: { muted: true } }),
    ).resolves.toBe(true);
    await expect(
      dispatch({ command: "conversation-saving", payload: { enabled: false } }),
    ).resolves.toBe(false);
    await expect(
      dispatch({ command: "text", payload: { text: "ping" } }),
    ).resolves.toEqual({ ok: true, text: "ping" });

    const vis = await dispatch({
      command: "companion-visibility",
      payload: { visible: false },
    });
    expect(vis).toBe(false);
    expect(window.hide).toHaveBeenCalled();
    expect(sendHostEvent).toHaveBeenCalledWith({ type: "visibility", visible: false });
  });

  it("throws TypeError on unknown commands", async () => {
    const dispatch = createNiaCompanionHostDispatcher({
      getCoordinator: () => ({ snapshot: () => ({ state: "resting" }) }),
    });
    await expect(dispatch({ command: "non-existent" })).rejects.toThrow(
      "Unsupported Nia companion host command",
    );
  });
});
