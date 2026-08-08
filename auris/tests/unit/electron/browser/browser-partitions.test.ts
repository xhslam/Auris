import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  AI_SANDBOX_PARTITION,
  HUMAN_PARTITION,
  createBrowserPartitionSelector,
} = require("../../../../electron/browser/browser-partitions.cjs");

function createSession() {
  return {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  };
}

describe("browser partition selector", () => {
  it("maps immutable modes to Human persist, shared AiSandbox, and AiShared=human storage", () => {
    const sessions = new Map<string, ReturnType<typeof createSession>>();
    const getSession = vi.fn((partition: string) => {
      if (!sessions.has(partition)) sessions.set(partition, createSession());
      return sessions.get(partition);
    });
    const selector = createBrowserPartitionSelector({ getSession });

    const human = selector.select("Human");
    const sandbox = selector.select("AiSandbox");
    const shared = selector.select("AiShared");

    expect(human).toMatchObject({
      automationMode: "Human",
      partition: HUMAN_PARTITION,
      persistent: true,
    });
    expect(human.partition).toMatch(/^persist:/);
    expect(sandbox).toMatchObject({
      automationMode: "AiSandbox",
      partition: AI_SANDBOX_PARTITION,
      persistent: false,
    });
    expect(sandbox.partition).not.toMatch(/^persist:/);
    expect(shared.partition).toBe(human.partition);
    expect(shared.persistent).toBe(true);
    expect(shared.automationMode).toBe("AiShared");
    expect(shared.session).toBe(human.session);
    expect(sandbox.session).not.toBe(human.session);
    expect(getSession).toHaveBeenCalledWith(HUMAN_PARTITION);
    expect(getSession).toHaveBeenCalledWith(AI_SANDBOX_PARTITION);
  });

  it("selects one immutable shared non-persistent AiSandbox partition", () => {
    const session = createSession();
    const getSession = vi.fn(() => session);
    const selector = createBrowserPartitionSelector({ getSession });

    const first = selector.select("AiSandbox");
    const second = selector.select("AiSandbox");

    expect(first).toBe(second);
    expect(first).toMatchObject({
      automationMode: "AiSandbox",
      partition: AI_SANDBOX_PARTITION,
      persistent: false,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.webPreferences)).toBe(true);
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("installs deny-by-default session and page policies exactly once per partition", () => {
    const sessions = new Map<string, ReturnType<typeof createSession>>();
    const getSession = vi.fn((partition: string) => {
      if (!sessions.has(partition)) sessions.set(partition, createSession());
      return sessions.get(partition);
    });
    const attach = vi.fn(() => vi.fn());
    const selector = createBrowserPartitionSelector({
      createPagePolicy: () => ({ attach }),
      getSession,
    });

    const sandbox = selector.select("AiSandbox");
    selector.select("AiSandbox");
    const human = selector.select("Human");
    selector.select("AiShared");

    expect(sessions.get(AI_SANDBOX_PARTITION)?.setPermissionCheckHandler).toHaveBeenCalledOnce();
    expect(sessions.get(HUMAN_PARTITION)?.setPermissionCheckHandler).toHaveBeenCalledOnce();
    expect(sessions.get(AI_SANDBOX_PARTITION)?.setPermissionCheckHandler.mock.calls[0]?.[0]()).toBe(false);

    const contents = { getURL: () => "", session: sessions.get(AI_SANDBOX_PARTITION) };
    sandbox.attachPagePolicy(contents);
    expect(attach).toHaveBeenCalledWith(contents);

    const humanContents = { getURL: () => "", session: sessions.get(HUMAN_PARTITION) };
    human.attachPagePolicy(humanContents);
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("attests only the exact pre-navigation webContents and clears proof on dispose", () => {
    const session = createSession();
    const disposePolicy = vi.fn();
    const attach = vi.fn(() => disposePolicy);
    const selector = createBrowserPartitionSelector({
      createPagePolicy: () => ({ attach }),
      getSession: () => session,
    });
    const context = selector.select("AiSandbox");
    const webContents = { getURL: () => "", session };
    const replay = { ...webContents };

    expect(context.isPagePolicyAttached(webContents)).toBe(false);
    const dispose = context.attachPagePolicy(webContents);
    expect(context.isPagePolicyAttached(webContents)).toBe(true);
    expect(context.isPagePolicyAttached(replay)).toBe(false);
    expect(context.disposePagePolicy(replay)).toBe(false);

    expect(context.disposePagePolicy(webContents)).toBe(true);
    expect(disposePolicy).toHaveBeenCalledOnce();
    expect(context.isPagePolicyAttached(webContents)).toBe(false);
    dispose();
    expect(disposePolicy).toHaveBeenCalledOnce();
  });

  it("rejects wrong-session, already-navigated, and failed policy attachment", () => {
    const session = createSession();
    const attach = vi.fn(() => vi.fn());
    const selector = createBrowserPartitionSelector({
      createPagePolicy: () => ({ attach }),
      getSession: () => session,
    });
    const context = selector.select("Human");

    expect(() => context.attachPagePolicy({
      getURL: () => "",
      session: {},
    })).toThrow(/session/i);
    expect(() => context.attachPagePolicy({
      getURL: () => "https://example.com/already-loaded",
      session,
    })).toThrow(/before.*navigation/i);
    expect(attach).not.toHaveBeenCalled();
  });

  it.each([
    { setPermissionRequestHandler: vi.fn() },
    { setPermissionCheckHandler: vi.fn() },
  ])("fails closed when a session deny handler is unavailable", (session) => {
    const selector = createBrowserPartitionSelector({
      getSession: () => session,
    });
    expect(() => selector.select("AiSandbox")).toThrow(/permission.*handler/i);
  });

  it("fails closed when the page policy cannot attach", () => {
    const session = createSession();
    const selector = createBrowserPartitionSelector({
      createPagePolicy: () => ({}),
      getSession: () => session,
    });
    expect(() => selector.select("AiSandbox")).toThrow(/page policy/i);
  });
});
