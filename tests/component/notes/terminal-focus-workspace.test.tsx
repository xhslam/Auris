import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopTerminalBridge, DesktopTerminalDataEvent, DesktopTerminalExitEvent, DesktopTerminalSessionRecord } from "@/platform/desktop/desktop-bridge";
import { TerminalFocusWorkspace } from "@/components/desktop/terminal-focus/terminal-focus-workspace";
import { TERMINAL_FOCUS_LAYOUT_KEY, TERMINAL_FOCUS_SCOPE } from "@/components/desktop/terminal-focus/terminal-focus-layout";

vi.mock("@/components/desktop/desktop-app-frame", () => ({ DesktopAppFrame: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/appearance/use-app-theme", () => ({ useAppTheme: () => "night" }));
vi.mock("@/components/notes-v2/terminal/setupFloatingPrompt", () => ({ setupFloatingPrompt: () => () => {} }));
const harness = vi.hoisted(() => ({ terminals: [] as Array<{
  textarea: HTMLTextAreaElement; input: (data: string) => void; title: (value: string) => void;
  key: (event: KeyboardEvent) => boolean; writes: string[]; dispose: ReturnType<typeof vi.fn>; fit: ReturnType<typeof vi.fn<() => void>>; paste: ReturnType<typeof vi.fn>;
}> , observers: [] as Array<{ callback: () => void; targets: Element[] }> }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {
  cols = 80; rows = 24; unicode = { activeVersion: "" }; options: object;
  entry = { textarea: document.createElement("textarea"), input: (data: string) => { void data; }, title: (value: string) => { void value; }, key: (event: KeyboardEvent) => { void event; return true; }, writes: [] as string[], dispose: vi.fn(), fit: vi.fn(), paste: vi.fn() };
  constructor(options: object) { this.options = options; harness.terminals.push(this.entry); }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) { this.entry.key = handler; }
  loadAddon(addon: { activate?: (terminal: unknown) => void }) { addon.activate?.(this); }
  open(host: HTMLElement) { this.entry.textarea.className = "xterm-helper-textarea"; host.appendChild(this.entry.textarea); }
  onData(listener: (data: string) => void) { this.entry.input = listener; }
  onTitleChange(listener: (title: string) => void) { this.entry.title = listener; }
  write(data: string) { this.entry.writes.push(data); }
  focus() { this.entry.textarea.focus(); }
  dispose() { this.entry.dispose(); }
  hasSelection() { return false; }
  getSelection() { return ""; }
  paste(data: string) { this.entry.paste(data); this.entry.input(data); }
  clear() {} selectAll() {} scrollToBottom() {}
} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { entry?: typeof harness.terminals[number]; activate(terminal: { entry: typeof harness.terminals[number] }) { this.entry = terminal.entry; } fit() { this.entry?.fit(); } } }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: class { findNext() {} clearDecorations() {} } }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));

function record(id: string, scope = TERMINAL_FOCUS_SCOPE): DesktopTerminalSessionRecord {
  return { id, backend: "pty", cwd: "/workspace", shell: "/bin/zsh", workspaceInstanceId: scope, cols: 80, rows: 24 };
}
function createBridge(records: DesktopTerminalSessionRecord[] = []) {
  let dataListener: (event: DesktopTerminalDataEvent) => void = () => {};
  let exitListener: (event: DesktopTerminalExitEvent) => void = () => {};
  const bridge: DesktopTerminalBridge = {
    create: vi.fn(), list: vi.fn().mockResolvedValue(records),
    resume: vi.fn(async (input) => ({ ...record(input.sessionId!), cwd: input.cwd ?? "/workspace", customTitle: input.customTitle ?? null })),
    rename: vi.fn(async (_id, title) => ({ customTitle: title })),
    listProjectDirectories: vi.fn().mockResolvedValue([]),
    pickProjectDirectory: vi.fn().mockResolvedValue({ path: "/workspace", name: "workspace", available: true }),
    resize: vi.fn().mockResolvedValue(undefined), kill: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn((listener) => { dataListener = listener; return () => {}; }),
    onExit: vi.fn((listener) => { exitListener = listener; return () => {}; }),
  };
  return { bridge, data: (event: DesktopTerminalDataEvent) => dataListener(event), exit: (event: DesktopTerminalExitEvent) => exitListener(event) };
}
function panes() { return document.querySelectorAll<HTMLElement>(".terminal-focus__pane"); }
async function newTerminal() {
  await waitFor(() => expect(screen.getAllByRole("button", { name: "新建终端" })[0]).toBeEnabled());
  fireEvent.click(screen.getAllByRole("button", { name: "新建终端" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "选择文件夹…" }));
}
async function addToEight(bridge: DesktopTerminalBridge) {
  for (let count = 1; count <= 8; count++) {
    await newTerminal();
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(count));
  }
}

beforeEach(() => {
  localStorage.clear(); harness.terminals.length = 0; harness.observers.length = 0;
  vi.stubGlobal("ResizeObserver", class {
    state = { callback: () => this.callback(), targets: [] as Element[] };
    constructor(private callback: () => void) { harness.observers.push(this.state); }
    observe(target: Element) { this.state.targets.push(target); }
    disconnect() {}
  });
});

describe("TerminalFocusWorkspace shared runtime", () => {
  it("starts eight isolated PTYs and routes input/output to the correct visible pane", async () => {
    const { bridge, data } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await addToEight(bridge);
    expect(panes()).toHaveLength(8);
    expect([...panes()].every((pane) => !pane.hidden)).toBe(true);
    expect(screen.getByRole("button", { name: "新建终端" })).toBeDisabled();
    const inputs = vi.mocked(bridge.resume).mock.calls.map(([input]) => input);
    expect(new Set(inputs.map((input) => input.sessionId)).size).toBe(8);
    expect(inputs.every((input) => input.workspaceInstanceId === TERMINAL_FOCUS_SCOPE && input.sessionId?.startsWith("focus-term-"))).toBe(true);
    for (let index = 0; index < 8; index++) {
      act(() => harness.terminals[index].input(`echo PANE_${index}\r`));
      act(() => data({ sessionId: inputs[index].sessionId!, data: `OUTPUT_${index}`, sequence: 1 }));
    }
    await waitFor(() => expect(bridge.write).toHaveBeenCalledTimes(8));
    inputs.forEach((input, index) => {
      expect(bridge.write).toHaveBeenCalledWith(input.sessionId, `echo PANE_${index}\r`);
      expect(harness.terminals[index].writes).toEqual([`OUTPUT_${index}`]);
    });
  });

  it("maximizes and restores without recreating or disposing any terminal; pane selection owns paste", async () => {
    const { bridge } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await addToEight(bridge);
    fireEvent.click(screen.getByRole("button", { name: "专注 Terminal 3" }));
    expect([...panes()].filter((pane) => !pane.hidden)).toHaveLength(1);
    expect(panes()[2]).not.toHaveAttribute("hidden");
    expect(screen.getByRole("tab", { name: /Terminal 3/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "恢复全部分屏" }));
    expect([...panes()].filter((pane) => !pane.hidden)).toHaveLength(8);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: vi.fn().mockResolvedValue("PASTED") } });
    fireEvent.pointerDown(panes()[0]);
    fireEvent.click(screen.getByRole("button", { name: "粘贴到当前终端" }));
    await waitFor(() => expect(harness.terminals[0].paste).toHaveBeenCalledWith("PASTED"));
    expect(harness.terminals[2].paste).not.toHaveBeenCalled();
    act(() => { harness.terminals[0].key(new KeyboardEvent("keydown", { key: "8", metaKey: true, ctrlKey: true })); });
    expect(screen.getByRole("tab", { name: /Terminal 8/ })).toHaveAttribute("aria-selected", "true");
    expect(bridge.resume).toHaveBeenCalledTimes(8);
    expect(harness.terminals.every((entry) => entry.dispose.mock.calls.length === 0)).toBe(true);
  });

  it("ignores Notes records, restores only its own sessions, and leaves backend sessions alive on route departure", async () => {
    const { bridge } = createBridge([record("notes-term-1", "notes-workspace"), { ...record("notes-term-2"), workspaceInstanceId: null }, record("focus-term-restored")]);
    const view = render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    expect(bridge.resume).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "focus-term-restored" }));
    expect(panes()).toHaveLength(1);
    view.unmount();
    expect(bridge.kill).not.toHaveBeenCalled();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    expect(vi.mocked(bridge.resume).mock.calls[1][0].sessionId).toBe("focus-term-restored");
  });

  it("restarts only the requested panel, closes only its PTY and keeps the other screens intact", async () => {
    const { bridge } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await addToEight(bridge);
    const oldId = panes()[2].dataset.sessionId;
    fireEvent.click(screen.getByRole("button", { name: "重启 Terminal 3" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(9));
    expect(bridge.kill).toHaveBeenCalledWith(oldId);
    expect(panes()[2].dataset.sessionId).not.toBe(oldId);
    const nextId = panes()[2].dataset.sessionId;
    expect(harness.terminals[0].dispose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "关闭 Terminal 3" }));
    await waitFor(() => expect(panes()).toHaveLength(7));
    expect(bridge.kill).toHaveBeenCalledWith(nextId);
    expect(screen.getByRole("button", { name: "新建终端" })).toBeEnabled();
  });

  it("observes every pane size and permits keyboard resizing without changing sessions", async () => {
    const { bridge } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await addToEight(bridge);
    const observer = harness.observers.at(-1)!;
    expect(observer.targets.filter((element) => element.classList.contains("terminal-focus__pane-host"))).toHaveLength(8);
    harness.terminals.forEach((terminal) => terminal.fit.mockClear());
    act(() => observer.callback());
    await waitFor(() => expect(harness.terminals.every((terminal) => terminal.fit.mock.calls.length > 0)).toBe(true));
    const separator = screen.getByRole("separator", { name: "调整第 1 列宽度" });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "53");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    fireEvent.change(screen.getByLabelText("终端分屏列数"), { target: { value: "4" } });
    expect(document.querySelector(".terminal-focus__grid")?.getAttribute("style")).toContain("0.25fr");
    expect(bridge.resume).toHaveBeenCalledTimes(8);
  });

  it("shows real process exit, does not label an idle Shell as Agent Done", async () => {
    const { bridge, exit } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal();
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    const id = vi.mocked(bridge.resume).mock.calls[0][0].sessionId!;
    act(() => exit({ sessionId: id, exitCode: 0 }));
    expect(within(screen.getByRole("tab")).getByText("已退出")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    expect(bridge.resume).toHaveBeenCalledTimes(1);
  });

  it("blocks early creation until backend recovery completes, retaining existing sessions", async () => {
    const { bridge } = createBridge();
    let resolveList!: (records: DesktopTerminalSessionRecord[]) => void;
    vi.mocked(bridge.list).mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));
    render(<TerminalFocusWorkspace bridge={bridge} />);
    expect(screen.getByText("正在恢复终端会话…")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "新建终端" })) {
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(bridge.resume).not.toHaveBeenCalled();
    await act(async () => { resolveList([record("focus-term-existing")]); });
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    expect(bridge.resume).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "focus-term-existing" }));
    expect(panes()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "新建终端" })).toBeEnabled();
  });

  it("does not auto-start a Shell; cancelling a folder choice creates no session", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.pickProjectDirectory!).mockResolvedValue(null);
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal();
    await waitFor(() => expect(bridge.pickProjectDirectory).toHaveBeenCalledTimes(1));
    expect(bridge.resume).not.toHaveBeenCalled();
    expect(panes()).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消新建终端" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses a selected outside-Vault project and preserves that cwd when restarting", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.pickProjectDirectory!).mockResolvedValue({ path: "/projects/中文 项目", name: "中文 项目", available: true });
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal();
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bridge.resume).mock.calls[0][0].cwd).toBe("/projects/中文 项目");
    fireEvent.click(screen.getByRole("button", { name: "重启 Terminal 1" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    expect(vi.mocked(bridge.resume).mock.calls[1][0].cwd).toBe("/projects/中文 项目");
  });

  it("starts independent terminals from recent projects without showing the native picker", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.listProjectDirectories!).mockResolvedValue([
      { path: "/projects/one", name: "one", available: true },
      { path: "/projects/two", name: "two", available: true },
      { path: "/projects/missing", name: "missing", available: false },
    ]);
    render(<TerminalFocusWorkspace bridge={bridge} />);
    for (const [index, name] of ["one", "two"].entries()) {
      await waitFor(() => expect(screen.getAllByRole("button", { name: "新建终端" })[0]).toBeEnabled());
      fireEvent.click(screen.getAllByRole("button", { name: "新建终端" })[0]);
      expect(await screen.findByRole("button", { name: /missing/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(index + 1));
      expect(vi.mocked(bridge.resume).mock.calls[index][0].cwd).toBe(`/projects/${name}`);
    }
    expect(bridge.pickProjectDirectory).not.toHaveBeenCalled();
    expect(panes()).toHaveLength(2);
  });

  it("prevents duplicate native pickers and ignores a result after the workspace unmounts", async () => {
    const { bridge } = createBridge();
    let resolvePicker!: (project: { path: string; name: string; available: boolean }) => void;
    vi.mocked(bridge.pickProjectDirectory!).mockImplementation(() => new Promise((resolve) => { resolvePicker = resolve; }));
    const view = render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal();
    const browse = screen.getByRole("button", { name: "正在选择文件夹…" });
    expect(browse).toBeDisabled();
    fireEvent.click(browse); fireEvent.click(browse);
    expect(bridge.pickProjectDirectory).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolvePicker({ path: "/projects/late-result", name: "late-result", available: true }));
    expect(bridge.resume).not.toHaveBeenCalled();
  });

  it("does not create a terminal when the native picker fails", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.pickProjectDirectory!).mockRejectedValue(new Error("目录不可用"));
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal();
    expect(await screen.findByRole("alert")).toHaveTextContent("目录不可用");
    expect(bridge.resume).not.toHaveBeenCalled();
  });

  it("groups sessions by startup project and does not terminate sessions when collapsing a group", async () => {
    const { bridge } = createBridge([{ ...record("focus-a"), cwd: "/one/auris" }, { ...record("focus-b"), cwd: "/two/auris" }]);
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    const first = screen.getByRole("group", { name: "启动项目：/one/auris" });
    expect(screen.getByRole("group", { name: "启动项目：/two/auris" })).toBeInTheDocument();
    fireEvent.click(within(first).getByRole("button", { expanded: true }));
    expect(within(first).queryByRole("tab")).not.toBeInTheDocument();
    expect(panes()).toHaveLength(2); expect(bridge.kill).not.toHaveBeenCalled();
    expect(screen.queryByText("最多同时展示 8 个终端")).not.toBeInTheDocument();
  });

  it("keeps ordinary status dot-only and distinguishes the current input target from visible panes", async () => {
    const { bridge } = createBridge(); render(<TerminalFocusWorkspace bridge={bridge} />);
    await addToEight(bridge);
    const sidebar = screen.getByRole("complementary", { name: "终端会话" });
    expect(within(sidebar).queryByText("运行中")).not.toBeInTheDocument();
    expect(within(sidebar).getAllByRole("img", { name: "运行中" })).toHaveLength(8);
    expect(document.querySelectorAll('.terminal-focus__session-row[data-visible="true"]')).toHaveLength(8);
    expect(document.querySelectorAll('.terminal-focus__session-row[data-active="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "专注 Terminal 3" }));
    expect(document.querySelectorAll('.terminal-focus__session-row[data-visible="true"]')).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /Terminal 3/ })).toHaveAttribute("aria-selected", "true");
  });

  it("renames without writing to the Shell; OSC changes do not replace the manual name, including after restart", async () => {
    const { bridge } = createBridge(); render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal(); await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    act(() => harness.terminals[0].title("Codex"));
    expect(screen.getByRole("tab", { name: /^Codex/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重命名 Terminal 1" }), { target: { value: "前端修复" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会话名称" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "重命名 Terminal 1" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /^前端修复/ })).toBeInTheDocument();
    act(() => harness.terminals[0].title("Claude Code"));
    expect(screen.getByRole("tab", { name: /^前端修复/ })).toBeInTheDocument();
    expect(bridge.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重启 Terminal 1" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    expect(vi.mocked(bridge.resume).mock.calls[1][0].customTitle).toBe("前端修复");
    expect(screen.getByRole("tab", { name: /^前端修复/ })).toBeInTheDocument();
  });

  it("cancels rename, restores automatic names when cleared, and keeps a failed save visible", async () => {
    const { bridge } = createBridge([{ ...record("focus-named"), customTitle: "旧名称" }]);
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    const field = screen.getByRole("textbox", { name: "重命名 Terminal 1" });
    fireEvent.change(field, { target: { value: "未保存" } }); fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("tab", { name: /^旧名称/ })).toBeInTheDocument(); expect(bridge.rename).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重命名 Terminal 1" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会话名称" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "重命名 Terminal 1" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /^Shell/ })).toBeInTheDocument();
    vi.mocked(bridge.rename!).mockRejectedValue(new Error("写入失败"));
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重命名 Terminal 1" }), { target: { value: "不能保存" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会话名称" }));
    await screen.findByText("保存失败，请重试。");
    expect(screen.getByRole("textbox", { name: "重命名 Terminal 1" })).toBeEnabled();
  });

  it.each(["未保存", ""])("restarts with only the confirmed title while rename %j is pending and later fails", async (draft) => {
    const { bridge } = createBridge([{ ...record("focus-confirmed"), customTitle: "已保存" }]);
    let rejectRename!: (error: Error) => void;
    vi.mocked(bridge.rename!).mockImplementation(() => new Promise((_resolve, reject) => { rejectRename = reject; }));
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重命名 Terminal 1" }), { target: { value: draft } });
    fireEvent.click(screen.getByRole("button", { name: "保存会话名称" }));
    expect(screen.getByRole("button", { name: "保存会话名称" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重启 Terminal 1" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    expect(vi.mocked(bridge.resume).mock.calls[1][0].customTitle).toBe("已保存");
    await act(async () => { rejectRename(new Error("持久化失败")); });
    expect(screen.getByRole("tab", { name: /^已保存/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^未保存/ })).not.toBeInTheDocument();
    expect(bridge.write).not.toHaveBeenCalled();
  });

  it("does not steal focus from another terminal after an asynchronous name save", async () => {
    const { bridge } = createBridge();
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal(); await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    await newTerminal(); await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    let resolveRename!: (value: { customTitle: string | null }) => void;
    vi.mocked(bridge.rename!).mockImplementation(() => new Promise((resolve) => { resolveRename = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "重命名 Terminal 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "重命名 Terminal 1" }), { target: { value: "保存中" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会话名称" }));
    act(() => { harness.terminals[1].textarea.focus(); });
    expect(document.activeElement).toBe(harness.terminals[1].textarea);
    await act(async () => { resolveRename({ customTitle: "保存中" }); });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "重命名 Terminal 1" })).not.toBeInTheDocument());
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(document.activeElement).toBe(harness.terminals[1].textarea);
  });

  it("resets an old program title when restarting a plain Shell", async () => {
    const { bridge } = createBridge(); render(<TerminalFocusWorkspace bridge={bridge} />);
    await newTerminal(); await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    act(() => harness.terminals[0].title("Codex"));
    expect(screen.getByRole("tab", { name: /^Codex/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重启 Terminal 1" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("tab", { name: /^Shell/ })).toBeInTheDocument();
  });

  it("keeps recent projects collapsed until requested and starts a selected recent project directly", async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.listProjectDirectories!).mockResolvedValue([{ path: "/projects/recent", name: "recent", available: true }]);
    render(<TerminalFocusWorkspace bridge={bridge} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "新建终端" })[0]).toBeEnabled());
    const details = document.querySelector(".terminal-focus__recent-projects") as HTMLDetailsElement;
    expect(details.open).toBe(false); expect(bridge.listProjectDirectories).not.toHaveBeenCalled();
    details.open = true; fireEvent(details, new Event("toggle"));
    fireEvent.click(await screen.findByRole("button", { name: "在最近项目 recent 中新建终端" }));
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bridge.resume).mock.calls[0][0].cwd).toBe("/projects/recent");
    expect(bridge.pickProjectDirectory).not.toHaveBeenCalled();
  });

  it("has a desktop-only empty state and tolerates corrupted layout preferences", () => {
    localStorage.setItem(TERMINAL_FOCUS_LAYOUT_KEY, "{broken");
    render(<TerminalFocusWorkspace bridge={null} />);
    expect(screen.getByText("终端仅在 Auris 桌面端可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建终端" })).toBeDisabled();
  });
});
