import { describe, expect, it } from "vitest";
import { groupTerminalSessions, isTerminalPaneVisible, normalizeSessionTitle, terminalProjectName, terminalSessionTitle } from "@/components/desktop/terminal-focus/terminal-session-presentation";
import type { NotesTerminalSession } from "@/components/notes-v2/terminal/use-notes-terminal-sessions";

const session = (id: string, cwd: string | null): NotesTerminalSession => ({ id, cwd, backend: "pty", isAlive: true, label: `Terminal ${id}`, shell: "/bin/zsh", status: "running", workspaceInstanceId: "focus" });

describe("terminal sidebar presentation", () => {
  it("recognizes only explicit program titles, with custom names taking precedence", () => {
    expect(terminalSessionTitle({ programTitle: "✳ Claude Code · project" })).toBe("Claude Code");
    expect(terminalSessionTitle({ programTitle: "Codex: task" })).toBe("Codex");
    expect(terminalSessionTitle({ programTitle: "Gemini CLI" })).toBe("Gemini CLI");
    expect(terminalSessionTitle({ customTitle: "前端修复", programTitle: "Codex" })).toBe("前端修复");
    for (const programTitle of [undefined, "zsh", "user@host:~", "/projects/codex", "~/claude", "codex-notes", "C:\\claude\\project"]) {
      expect(terminalSessionTitle({ programTitle })).toBe("Shell");
    }
  });
  it("keeps same-name projects separate by their complete startup paths", () => {
    const records = [session("1", "/work/auris"), session("2", "/other/auris"), session("3", "/work/auris")];
    const groups = groupTerminalSessions(records);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.name)).toEqual(["auris", "auris"]);
    expect(groups[0].sessions.map((item) => item.id)).toEqual(["1", "3"]);
    expect(groups[1].cwd).toBe("/other/auris");
    expect(records.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });
  it("handles root/default/Windows project names and preserves actual path spaces", () => {
    expect(terminalProjectName(null)).toBe("默认目录");
    expect(terminalProjectName("/")).toBe("/");
    expect(terminalProjectName("C:\\work\\auris\\")).toBe("auris");
    expect(terminalProjectName("/work/project ")).toBe("project ");
    expect(groupTerminalSessions([session("1", null), session("2", "default:")])).toHaveLength(2);
  });
  it("separates an input-active session from every displayed terminal pane", () => {
    expect(isTerminalPaneVisible("other", "active", false)).toBe(true);
    expect(isTerminalPaneVisible("other", "active", true)).toBe(false);
    expect(isTerminalPaneVisible("active", "active", true)).toBe(true);
  });
  it("normalizes display-only titles without emitting Shell input", () => {
    expect(normalizeSessionTitle("  \u0000修复\n前端  ")).toBe("修复前端");
    expect(normalizeSessionTitle("  ")).toBeNull();
    expect([...normalizeSessionTitle("😀".repeat(100))!]).toHaveLength(64);
  });
});
