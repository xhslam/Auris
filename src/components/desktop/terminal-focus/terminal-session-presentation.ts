import type { NotesTerminalSession } from "@/components/notes-v2/terminal/use-notes-terminal-sessions";

export function normalizeSessionTitle(value: string): string | null {
  return [...value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()].slice(0, 64).join("") || null;
}

/** Never mistake arbitrary OSC text, a user name or a directory for a program. */
export function terminalSessionTitle(session: Pick<NotesTerminalSession, "customTitle" | "programTitle">): string {
  if (session.customTitle) return session.customTitle;
  const title = (session.programTitle ?? "").replace(/^[^\p{L}\p{N}/\\~]+/u, "").trim();
  if (/^claude(?:\s+code)?(?=$|\s|[·:—–])/i.test(title)) return "Claude Code";
  if (/^codex(?=$|\s|[·:—–])/i.test(title)) return "Codex";
  if (/^gemini(?:\s+cli)?(?=$|\s|[·:—–])/i.test(title)) return "Gemini CLI";
  if (/^antigravity(?=$|\s|[·:—–])/i.test(title)) return "Antigravity";
  return "Shell";
}

export function terminalProjectName(cwd: string | null): string {
  if (!cwd) return "默认目录";
  // Both separators are handled for Windows paths, including when previewed
  // on macOS. Do not trim whitespace: it can be part of a real directory name.
  const stripped = cwd.replace(/[\\/]+$/, "");
  return stripped.split(/[\\/]/).at(-1) || cwd;
}

export type TerminalProjectGroup = { key: string; cwd: string | null; name: string; sessions: NotesTerminalSession[] };
export function groupTerminalSessions(sessions: NotesTerminalSession[]): TerminalProjectGroup[] {
  const groups = new Map<string, TerminalProjectGroup>();
  for (const session of sessions) {
    const key = session.cwd === null ? "default:" : `path:${session.cwd}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, cwd: session.cwd, name: terminalProjectName(session.cwd), sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

export function isTerminalPaneVisible(id: string, activeId: string | null, singlePane: boolean) {
  return !singlePane || id === activeId;
}

export const TERMINAL_SESSION_STATUS = { starting: "启动中", running: "运行中", exited: "已退出", failed: "失败" } as const;
