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
  key: (event: KeyboardEvent) => boolean; writes: string[]; dispose: ReturnType<typeof vi.fn>; fit: ReturnType<typeof vi.fn>; paste: ReturnType<typeof vi.fn>;
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
    resume: vi.fn(async (input) => record(input.sessionId!)),
    resize: vi.fn().mockResolvedValue(undefined), kill: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn((listener) => { dataListener = listener; return () => {}; }),
    onExit: vi.fn((listener) => { exitListener = listener; return () => {}; }),
  };
  return { bridge, data: (event: DesktopTerminalDataEvent) => dataListener(event), exit: (event: DesktopTerminalExitEvent) => exitListener(event) };
}
function panes() { return document.querySelectorAll<HTMLElement>(".terminal-focus__pane"); }
async function addToEight(bridge: DesktopTerminalBridge) {
  await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
  for (let count = 2; count <= 8; count++) {
    fireEvent.click(screen.getByRole("button", { name: "新建终端" }));
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

  it("has a desktop-only empty state and tolerates corrupted layout preferences", () => {
    localStorage.setItem(TERMINAL_FOCUS_LAYOUT_KEY, "{broken");
    render(<TerminalFocusWorkspace bridge={null} />);
    expect(screen.getByText("终端仅在 Auris 桌面端可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建终端" })).toBeDisabled();
  });
});
