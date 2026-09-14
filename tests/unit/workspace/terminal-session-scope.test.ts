import { describe, expect, it } from "vitest";
import {
  selectActiveTerminalSessionId,
  selectTerminalSessionsForWorkspace,
} from "@/features/notes/workspace/terminal-session-scope";

describe("terminal session workspace scope", () => {
  it("shows only sessions owned by the active workspace", () => {
    const sessions = [
      { id: "a-1", workspaceInstanceId: "workspace:a" },
      { id: "b-1", workspaceInstanceId: "workspace:b" },
      { id: "legacy", workspaceInstanceId: null },
    ];

    expect(selectTerminalSessionsForWorkspace(sessions, "workspace:a")).toEqual([
      sessions[0],
      sessions[2],
    ]);
    expect(selectTerminalSessionsForWorkspace(sessions, "workspace:b")).toEqual([
      sessions[1],
      sessions[2],
    ]);
    expect(selectTerminalSessionsForWorkspace(sessions, null)).toEqual([
      sessions[2],
    ]);
  });

  it("restores the last active session for a workspace", () => {
    const sessions = [
      { id: "a-1", workspaceInstanceId: "workspace:a" },
      { id: "a-2", workspaceInstanceId: "workspace:a" },
      { id: "b-1", workspaceInstanceId: "workspace:b" },
    ];

    expect(
      selectActiveTerminalSessionId(
        sessions,
        "workspace:a",
        "b-1",
        "a-1",
      ),
    ).toBe("a-1");
    expect(
      selectActiveTerminalSessionId(
        sessions,
        "workspace:a",
        "b-1",
        "missing",
      ),
    ).toBe("a-2");
  });
});
