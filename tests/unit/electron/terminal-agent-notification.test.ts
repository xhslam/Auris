import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

describe("terminal agent notifications and badge calculation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function calculateBadgeCount(
    sessions: Array<{ agentState: string; unread: boolean }>,
  ): number {
    let count = 0;
    for (const session of sessions) {
      if (session.agentState === "waiting") {
        count++;
      } else if (session.agentState === "done" && session.unread) {
        count++;
      }
    }
    return count;
  }

  function getNotificationTitle(session: {
    customTitle?: string | null;
    agentKind?: string | null;
    cwd?: string | null;
  }): string {
    if (session.customTitle) return session.customTitle;
    const projectName = session.cwd
      ? path.basename(session.cwd) || session.cwd
      : "默认目录";
    const agentName = session.agentKind || "Claude Code";
    return `${agentName} · ${projectName}`;
  }

  function getNotificationBody(agentState: string): string {
    return agentState === "waiting" ? "等待确认操作" : "已完成当前任务";
  }

  function shouldSendNotification(params: {
    isWindowFocused: boolean;
    isVisiblePane: boolean;
    notificationsEnabled: boolean;
    agentState: string;
  }): boolean {
    if (!params.notificationsEnabled) return false;
    if (params.agentState !== "waiting" && params.agentState !== "done") return false;
    if (params.isWindowFocused && params.isVisiblePane) return false;
    return true;
  }

  it("calculates dock/taskbar badge count accurately from waiting + unread done sessions", () => {
    expect(calculateBadgeCount([])).toBe(0);

    const sessions = [
      { agentState: "waiting", unread: false },
      { agentState: "done", unread: true },
      { agentState: "done", unread: false }, // already read, not counted
      { agentState: "working", unread: false },
      { agentState: "idle", unread: false },
    ];
    expect(calculateBadgeCount(sessions)).toBe(2);

    // After user reads the done session
    sessions[1].unread = false;
    expect(calculateBadgeCount(sessions)).toBe(1);

    // After waiting session is resolved
    sessions[0].agentState = "working";
    expect(calculateBadgeCount(sessions)).toBe(0);
  });

  it("formats notification title with custom name or Agent · Project", () => {
    expect(
      getNotificationTitle({
        customTitle: "修复登录接口",
        agentKind: "claude-code",
        cwd: "/Users/dev/project",
      }),
    ).toBe("修复登录接口");

    expect(
      getNotificationTitle({
        customTitle: null,
        agentKind: "Claude Code",
        cwd: "/Users/dev/auris",
      }),
    ).toBe("Claude Code · auris");

    expect(
      getNotificationTitle({
        customTitle: null,
        agentKind: null,
        cwd: null,
      }),
    ).toBe("Claude Code · 默认目录");
  });

  it("formats notification body for waiting and done", () => {
    expect(getNotificationBody("waiting")).toBe("等待确认操作");
    expect(getNotificationBody("done")).toBe("已完成当前任务");
  });

  it("suppresses notification when window is focused and session is in visible pane", () => {
    expect(
      shouldSendNotification({
        isWindowFocused: true,
        isVisiblePane: true,
        notificationsEnabled: true,
        agentState: "waiting",
      }),
    ).toBe(false);

    expect(
      shouldSendNotification({
        isWindowFocused: false,
        isVisiblePane: true,
        notificationsEnabled: true,
        agentState: "waiting",
      }),
    ).toBe(true);

    expect(
      shouldSendNotification({
        isWindowFocused: true,
        isVisiblePane: false,
        notificationsEnabled: true,
        agentState: "done",
      }),
    ).toBe(true);

    expect(
      shouldSendNotification({
        isWindowFocused: false,
        isVisiblePane: false,
        notificationsEnabled: false,
        agentState: "done",
      }),
    ).toBe(false);
  });

  it("triggers notification immediately on leading edge and suppresses subsequent notifications for 3 seconds", () => {
    const notifySpy = vi.fn();
    const cooldowns = new Map<string, number>();

    function dispatchNotification(sessionId: string, state: string) {
      const now = Date.now();
      const cooldownUntil = cooldowns.get(sessionId) ?? 0;
      if (now < cooldownUntil) {
        return;
      }
      cooldowns.set(sessionId, now + 3000);
      notifySpy(sessionId, state);
    }

    // First event: fires immediately without delay
    dispatchNotification("s1", "waiting");
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith("s1", "waiting");

    // Rapid second event at +1000ms: suppressed by 3s cooldown
    vi.advanceTimersByTime(1000);
    dispatchNotification("s1", "done");
    expect(notifySpy).toHaveBeenCalledTimes(1);

    // Another event at +2500ms: still suppressed
    vi.advanceTimersByTime(1500);
    dispatchNotification("s1", "done");
    expect(notifySpy).toHaveBeenCalledTimes(1);

    // Event after 3000ms (at +3500ms): fires immediately
    vi.advanceTimersByTime(1000);
    dispatchNotification("s1", "done");
    expect(notifySpy).toHaveBeenCalledTimes(2);
    expect(notifySpy).toHaveBeenLastCalledWith("s1", "done");
  });
});
