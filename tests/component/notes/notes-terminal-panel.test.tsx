import type { CSSProperties } from "react";
import type { ITheme } from "@xterm/xterm";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";
import type {
  DesktopTerminalBridge,
  DesktopTerminalDataEvent,
  DesktopTerminalExitEvent,
  DesktopTerminalSessionRecord,
} from "@/platform/desktop/desktop-bridge";

type CapturedTerminalOptions = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  cursorStyle?: string;
  minimumContrastRatio?: number;
  drawBoldTextInBrightColors?: boolean;
  theme?: ITheme;
};

let capturedTerminalOptions: CapturedTerminalOptions | null = null;
const terminalInputListeners: Array<(data: string) => void> = [];
const terminalClearSpies: Array<Mock<() => void>> = [];
const terminalFocusSpies: Array<Mock<() => void>> = [];
const terminalSelectAllSpies: Array<Mock<() => void>> = [];
const terminalKeyHandlers: Array<(event: KeyboardEvent) => boolean> = [];
const terminalWrites: string[][] = [];
const terminalDisposeSpies: Array<Mock<() => void>> = [];
const terminalFitSpies: Array<Mock<() => void>> = [];
const terminalPasteSpies: Array<Mock<(text: string) => void>> = [];
const terminalTitleListeners: Array<(title: string) => void> = [];
let terminalSelection = "";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    unicode = {
      activeVersion: "",
    };
    writeIndex = 0;
    textarea: HTMLTextAreaElement | null = null;
    options: CapturedTerminalOptions;

    constructor(options: CapturedTerminalOptions) {
      this.options = options;
      capturedTerminalOptions = options;
      terminalDisposeSpies.push(vi.fn<() => void>());
      terminalClearSpies.push(vi.fn<() => void>());
      terminalFocusSpies.push(vi.fn<() => void>());
      terminalSelectAllSpies.push(vi.fn<() => void>());
      this.writeIndex = terminalWrites.push([]) - 1;
      terminalPasteSpies.push(vi.fn<(text: string) => void>());
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalKeyHandlers.push(handler);
      return undefined;
    }

    hasSelection() {
      return terminalSelection.length > 0;
    }

    clear() {
      terminalClearSpies[this.writeIndex]?.();
      return undefined;
    }

    dispose() {
      terminalDisposeSpies[this.writeIndex]?.();
      return undefined;
    }

    focus() {
      terminalFocusSpies[this.writeIndex]?.();
      this.textarea?.focus();
      return undefined;
    }

    getSelection() {
      return terminalSelection;
    }

    loadAddon() {
      return undefined;
    }

    onData(listener: (data: string) => void) {
      terminalInputListeners.push(listener);
      return { dispose() {} };
    }

    onTitleChange(listener: (title: string) => void) {
      terminalTitleListeners.push(listener);
      return { dispose() {} };
    }

    paste(text: string) {
      terminalPasteSpies[this.writeIndex]?.(text);
      terminalInputListeners[this.writeIndex]?.(text);
    }

    scrollToBottom() {}

    open(container: HTMLElement) {
      const stub = document.createElement("div");
      stub.dataset.testid = "xterm-stub";
      this.textarea = document.createElement("textarea");
      this.textarea.className = "xterm-helper-textarea";
      stub.appendChild(this.textarea);
      container.appendChild(stub);
    }

    selectAll() {
      terminalSelectAllSpies[this.writeIndex]?.();
      return undefined;
    }

    write(data: string) {
      terminalWrites[this.writeIndex]?.push(data);
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    index = terminalFitSpies.push(vi.fn<() => void>()) - 1;
    fit() {
      terminalFitSpies[this.index]?.();
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    clearDecorations() {
      return undefined;
    }

    findNext() {
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: class {},
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(handler: unknown) {
      void handler;
    }
  },
}));

type TerminalBridgeHarness = {
  bridge: DesktopTerminalBridge;
  emitExit: (event: DesktopTerminalExitEvent) => void;
  emitData: (event: DesktopTerminalDataEvent) => void;
};

function createTerminalBridge(
  backend: "pipe" | "pty" = "pty",
): TerminalBridgeHarness {
  let exitListener: ((event: DesktopTerminalExitEvent) => void) | null = null;
  let dataListener: ((event: DesktopTerminalDataEvent) => void) | null = null;
  const startSession = async (input: Parameters<DesktopTerminalBridge["resume"]>[0]) => ({
    backend,
    cols: input.cols ?? 80,
    cwd: input.cwd ?? null,
    id: input.sessionId ?? "term-1",
    rows: input.rows ?? 24,
    shell: backend === "pipe" ? "/bin/zsh" : "C:\\Windows\\System32\\cmd.exe",
  });

  return {
    bridge: {
      create: vi.fn<DesktopTerminalBridge["create"]>(startSession),
      kill: vi.fn<DesktopTerminalBridge["kill"]>(async () => undefined),
      list: vi.fn<DesktopTerminalBridge["list"]>(async () => []),
      onData: vi.fn((listener) => {
        dataListener = listener;
        return () => { dataListener = null; };
      }),
      onExit: vi.fn((listener) => {
        exitListener = listener;
        return () => {
          exitListener = null;
        };
      }),
      resize: vi.fn<DesktopTerminalBridge["resize"]>(async () => undefined),
      resume: vi.fn<DesktopTerminalBridge["resume"]>(startSession),
      write: vi.fn<DesktopTerminalBridge["write"]>(async () => undefined),
    },
    emitExit(event) {
      exitListener?.(event);
    },
    emitData(event) { dataListener?.(event); },
  };
}

function createDeferredCreateResult(backend: "pipe" | "pty" = "pty") {
  let resolve: ((sessionId: string) => void) | null = null;

  return {
    promise: new Promise<{
      backend: "pipe" | "pty";
      cols: number;
      cwd: string | null;
      id: string;
      rows: number;
      shell: string;
    }>((nextResolve) => {
      resolve = (sessionId: string) =>
        nextResolve({
          backend,
          cols: 80,
          cwd: "C:\\vault",
          id: sessionId,
          rows: 24,
          shell: "C:\\Windows\\System32\\cmd.exe",
        });
    }),
    resolve(sessionId: string) {
      resolve?.(sessionId);
    },
  };
}

describe("NotesTerminalPanel", () => {
  beforeEach(() => {
    capturedTerminalOptions = null;
    terminalClearSpies.length = 0;
    terminalInputListeners.length = 0;
    terminalFocusSpies.length = 0;
    terminalSelectAllSpies.length = 0;
    terminalKeyHandlers.length = 0;
    terminalWrites.length = 0;
    terminalDisposeSpies.length = 0;
    terminalFitSpies.length = 0;
    terminalPasteSpies.length = 0;
    terminalTitleListeners.length = 0;
    window.localStorage.removeItem("auris.notes.terminal.font-size");
    terminalSelection = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => ""),
        writeText: vi.fn(async () => undefined),
      },
    });
    Reflect.deleteProperty(window, "shadowingDesktop");
  });

  it("also deduplicates snapshot-covered data delivered after resume", async () => {
    const terminal = createTerminalBridge();
    vi.mocked(terminal.bridge.resume).mockImplementation(async ({ sessionId }) => ({ backend: "pty", cwd: "C:\\vault", id: sessionId!, shell: "C:\\Windows\\System32\\cmd.exe", output: "AB", outputSequence: 2 }));
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    // The first test pays Vitest's dynamic-addon import cost. This assertion
    // checks the protocol, not a one-second wall-clock startup SLA.
    await waitFor(() => expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("data-status", "running"), { timeout: 5_000 });
    act(() => {
      terminal.emitData({ sessionId: "notes-term-1", data: "B", sequence: 2 });
      terminal.emitData({ sessionId: "notes-term-1", data: "C", sequence: 3 });
      terminal.emitData({ sessionId: "notes-term-1", data: "C", sequence: 3 });
    });
    expect(terminalWrites[0].join("")).toBe("ABC");
  });

  it("preserves the unknown-boundary attach tail including ANSI prefixes beyond 200k", async () => {
    const terminal = createTerminalBridge();
    let resolve!: (record: DesktopTerminalSessionRecord) => void;
    vi.mocked(terminal.bridge.resume).mockImplementation(() => new Promise(next => { resolve = next; }));
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    const prefix = "\u001b[?1049h";
    const tail = "x".repeat(200_000);
    act(() => {
      terminal.emitData({ sessionId: "notes-term-1", data: prefix, sequence: 1 });
      terminal.emitData({ sessionId: "notes-term-1", data: tail, sequence: 2 });
    });
    await act(async () => resolve({ backend: "pty", cwd: "C:\\vault", id: "notes-term-1", shell: "C:\\Windows\\System32\\cmd.exe", output: "", outputSequence: 0 }));
    expect(terminalWrites[0].join("")).toBe(prefix + tail);
  });

  it("does not steal search focus when the pending resume completes", async () => {
    const terminal = createTerminalBridge();
    const deferred = createDeferredCreateResult();
    vi.mocked(terminal.bridge.resume).mockImplementation(() => deferred.promise);
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    act(() => terminalKeyHandlers[0](new KeyboardEvent("keydown", { key: "f", ctrlKey: true })));
    const input = screen.getByPlaceholderText(NOTES_UI_COPY.panels.terminal.searchPlaceholder);
    expect(input).toHaveFocus();
    await act(async () => deferred.resolve("notes-term-1"));
    expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("data-status", "running");
    expect(input).toHaveFocus();
    expect(terminal.bridge.write).not.toHaveBeenCalled();
  });

  it("shows an unattached live tab's final output without spawning it after exit", async () => {
    const terminal = createTerminalBridge();
    vi.mocked(terminal.bridge.list).mockResolvedValue([
      { backend: "pty", cwd: "C:\\vault", id: "notes-term-21", shell: "C:\\Windows\\System32\\cmd.exe", output: "HISTORY", outputSequence: 1 },
      { backend: "pty", cwd: "C:\\vault", id: "notes-term-22", shell: "C:\\Windows\\System32\\cmd.exe", output: "", outputSequence: 0 },
    ]);
    const user = userEvent.setup();
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    act(() => {
      terminal.emitData({ sessionId: "notes-term-21", data: "TAIL", sequence: 2 });
      terminal.emitExit({ sessionId: "notes-term-21", exitCode: 0, signal: null, output: "HISTORYTAIL", outputSequence: 2 });
    });
    await user.click(screen.getByRole("tab", { name: "Terminal 1" }));
    await waitFor(() => expect(terminalWrites).toHaveLength(2));
    expect(terminalWrites[1].join("")).toContain("HISTORYTAIL");
    expect(terminalWrites[1].join("")).toContain("restart");
    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
    act(() => terminalInputListeners[1]("r"));
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(2));
    expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-23", "r");
  });

  it("does not rebound after close-last but creates a new shell when reopened", async () => {
    const terminal = createTerminalBridge();
    const onClosePanel = vi.fn();
    const panel = (visible: boolean) => <NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} visible={visible} onClosePanel={onClosePanel} />;
    const view = render(panel(true));
    const user = userEvent.setup();
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: NOTES_UI_COPY.panels.terminal.closeSession }));
    expect(onClosePanel).toHaveBeenCalledTimes(1);
    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
    view.rerender(panel(false));
    view.rerender(panel(true));
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("data-status", "running");
  });

  it("replays a resume snapshot before live output and deduplicates its sequence boundary", async () => {
    const terminal = createTerminalBridge();
    let resolve!: (record: DesktopTerminalSessionRecord) => void;
    const record = new Promise<DesktopTerminalSessionRecord>((done) => { resolve = done; });
    terminal.bridge.resume = vi.fn(() => record);
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    const id = vi.mocked(terminal.bridge.resume).mock.calls[0][0].sessionId!;
    terminal.emitData({ sessionId: id, data: "B", sequence: 2 } as DesktopTerminalDataEvent);
    terminal.emitData({ sessionId: id, data: "C", sequence: 3 } as DesktopTerminalDataEvent);
    expect(terminalWrites[0]).toEqual([]);
    await act(async () => {
      resolve({ id, backend: "pty", cwd: null, shell: "C:\\Windows\\System32\\cmd.exe", output: "AB", outputSequence: 2 } as DesktopTerminalSessionRecord);
      await record;
    });
    expect(terminalWrites[0].join("")).toBe("ABC");
    terminal.emitData({ sessionId: id, data: "D", sequence: 4 } as DesktopTerminalDataEvent);
    expect(terminalWrites[0].join("")).toBe("ABCD");
  });

  it("does not resurrect a shell that exits while resume is pending", async () => {
    const terminal = createTerminalBridge();
    const deferred = createDeferredCreateResult();
    terminal.bridge.resume = vi.fn(() => deferred.promise);
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    const id = vi.mocked(terminal.bridge.resume).mock.calls[0][0].sessionId!;
    act(() => terminal.emitExit({ sessionId: id, exitCode: 7 }));
    await act(async () => { deferred.resolve(id); await deferred.promise; });
    expect(screen.getByRole("tab")).toHaveAttribute("data-status", "exited");
    expect(terminalWrites[0].join("")).toContain("Process exited with code 7");
    act(() => terminalInputListeners[0]("echo restart\r"));
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(2));
  });

  it("uses a program title for VMark-style compact session glyphs", async () => {
    const terminal = createTerminalBridge();
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    act(() => terminalTitleListeners[0]?.("cmd"));
    expect(screen.getByRole("tab", { name: "cmd" })).toHaveTextContent("C");
  });

  it("supports terminal-local search and font zoom without editor shortcuts", async () => {
    const terminal = createTerminalBridge();
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    const find = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, cancelable: true });
    act(() => expect(terminalKeyHandlers[0](find)).toBe(false));
    expect(find.defaultPrevented).toBe(true);
    expect(screen.getByPlaceholderText(NOTES_UI_COPY.panels.terminal.searchPlaceholder)).toHaveFocus();
    const zoom = new KeyboardEvent("keydown", { key: "+", ctrlKey: true, cancelable: true });
    act(() => expect(terminalKeyHandlers[0](zoom)).toBe(false));
    expect(capturedTerminalOptions?.fontSize).toBe(15);
    act(() => terminalKeyHandlers[0](new KeyboardEvent("keydown", { key: "0", ctrlKey: true })));
    expect(capturedTerminalOptions?.fontSize).toBe(13);
    const ime = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, isComposing: true });
    expect(terminalKeyHandlers[0](ime)).toBe(true);
  });

  it("reveals the selected restored session after its asynchronous attach completes", async () => {
    const terminal = createTerminalBridge();
    const deferred = createDeferredCreateResult();
    vi.mocked(terminal.bridge.list).mockResolvedValue([
      { backend: "pty", cols: 80, cwd: "/vault", id: "notes-term-41", rows: 24, shell: "/bin/zsh" },
    ]);
    terminal.bridge.resume = vi.fn(() => deferred.promise);
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);

    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("tab", { selected: true })).toHaveTextContent("1");
    await act(async () => {
      deferred.resolve("notes-term-41");
      await deferred.promise;
    });
    const container = screen.getByTestId("xterm-stub").parentElement;
    expect(container?.style.display).toBe("block");
    expect(terminalFocusSpies[0]).toHaveBeenCalled();
    act(() => terminalInputListeners[0]("printf READY\r"));
    expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-41", "printf READY\r");
  });

  it("updates the ANSI palette and scoped colors of the same live terminal", async () => {
    const terminal = createTerminalBridge();
    const view = render(
      <div className="notes-v2" data-notes-theme="paper" style={{ "--notes-bg": "#EEEDED", "--notes-text": "#1a1a1a", "--notes-editor-font-mono": "Menlo, monospace" } as CSSProperties}>
        <NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />
      </div>,
    );
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    expect(capturedTerminalOptions).toMatchObject({ fontSize: 13, lineHeight: 1.2, cursorStyle: "bar", minimumContrastRatio: 4.5 });
    expect(capturedTerminalOptions?.theme?.red).toBe("#c33820");
    expect(capturedTerminalOptions?.fontFamily).toBe("Menlo, monospace");
    const originalScreen = screen.getByTestId("xterm-stub");
    view.rerender(
      <div className="notes-v2" data-notes-theme="solarized" style={{ "--notes-bg": "#002b36", "--notes-text": "#93a1a1", "--notes-editor-font-mono": "Consolas, monospace" } as CSSProperties}>
        <NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />
      </div>,
    );
    await waitFor(() => expect(capturedTerminalOptions?.theme?.background).toBe("#002b36"));
    expect(capturedTerminalOptions?.theme).toMatchObject({ red: "#dc322f", brightCyan: "#93a1a1", cursorAccent: "#002b36", scrollbarSliderBackground: "rgba(147, 161, 161, 0.2)" });
    expect(capturedTerminalOptions?.drawBoldTextInBrightColors).toBe(false);
    expect(capturedTerminalOptions?.fontFamily).toBe("Consolas, monospace");
    expect(screen.getByTestId("xterm-stub")).toBe(originalScreen);
    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
    expect(terminalDisposeSpies[0]).not.toHaveBeenCalled();
  });

  it("keeps a hidden terminal screen without spawning, resizing or stealing focus", async () => {
    const terminal = createTerminalBridge();
    const renderPanel = (visible: boolean, theme: string) => (
      <div className="notes-v2" data-notes-theme={theme}>
        <NotesTerminalPanel commands={[]} visible={visible} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />
      </div>
    );
    const view = render(renderPanel(true, "paper"));
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    const originalScreen = screen.getByTestId("xterm-stub");
    view.rerender(renderPanel(false, "paper"));
    terminalFocusSpies[0].mockClear();
    terminalFitSpies[0].mockClear();
    vi.mocked(terminal.bridge.resize).mockClear();
    view.rerender(renderPanel(false, "night"));
    await waitFor(() => expect(capturedTerminalOptions?.theme?.red).toBe("#f85149"));
    expect(terminal.bridge.resize).not.toHaveBeenCalled();
    expect(terminalFocusSpies[0]).not.toHaveBeenCalled();
    expect(terminalFitSpies[0]).not.toHaveBeenCalled();
    expect(terminalDisposeSpies[0]).not.toHaveBeenCalled();
    expect(terminal.bridge.kill).not.toHaveBeenCalled();
    view.rerender(renderPanel(true, "night"));
    await waitFor(() => expect(terminalFocusSpies[0]).toHaveBeenCalled());
    expect(screen.getByTestId("xterm-stub")).toBe(originalScreen);
    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
  });

  it("does not create a shell in a hidden empty workspace scope", async () => {
    const terminal = createTerminalBridge();
    const view = render(<NotesTerminalPanel commands={[]} visible={false} isDesktopBridgeAvailable terminalBridge={terminal.bridge} workspaceInstanceId="empty" />);
    await waitFor(() => expect(terminal.bridge.list).toHaveBeenCalledTimes(1));
    expect(terminal.bridge.resume).not.toHaveBeenCalled();
    expect(screen.queryByTestId("xterm-stub")).not.toBeInTheDocument();
    view.rerender(<NotesTerminalPanel commands={[]} visible isDesktopBridgeAvailable terminalBridge={terminal.bridge} workspaceInstanceId="empty" />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    expect(terminal.bridge.resume).toHaveBeenCalledWith(expect.objectContaining({ workspaceInstanceId: "empty" }));
  });

  it("does not steal focus when a pending clipboard paste completes after hiding", async () => {
    const terminal = createTerminalBridge();
    let resolveClipboard!: (text: string) => void;
    const clipboard = new Promise<string>((resolve) => { resolveClipboard = resolve; });
    vi.mocked(navigator.clipboard.readText).mockImplementation(() => clipboard);
    const panel = (visible: boolean) => <NotesTerminalPanel commands={[]} visible={visible} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />;
    const view = render(panel(true));
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("data-status", "running");
      expect(terminalFocusSpies[0]).toHaveBeenCalled();
    });
    fireEvent.contextMenu(document.querySelector(".notes-v2__terminal-surface")!);
    fireEvent.click(screen.getByRole("menuitem", { name: NOTES_UI_COPY.panels.terminal.contextMenu.paste }));
    await waitFor(() => expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1));
    view.rerender(panel(false));
    terminalFocusSpies[0].mockClear();
    await act(async () => { resolveClipboard("printf PASTED\r"); });
    await waitFor(() => expect(terminal.bridge.write).toHaveBeenCalledWith(expect.any(String), "printf PASTED\r"));
    expect(terminalFocusSpies[0]).not.toHaveBeenCalled();
    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
  });

  it("identifies the pipe fallback as a terminal without a TTY", async () => {
    const terminal = createTerminalBridge("pipe");
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    expect(await screen.findByRole("status")).toHaveTextContent("未连接到 TTY");
  });

  it("uses an accessible icon for the optional transcript in compact mode", async () => {
    const terminal = createTerminalBridge();
    terminal.bridge.readTranscript = vi.fn().mockResolvedValue(null);
    terminal.bridge.configureTranscript = vi.fn().mockResolvedValue({ enabled: false });
    terminal.bridge.transcriptStatus = vi.fn().mockResolvedValue({ enabled: false });
    render(<NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    const toggle = screen.getByRole("button", { name: "显示 Agent 执行记录" });
    expect(toggle).toHaveTextContent("");
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the scoped notes theme for xterm colors", async () => {
    document.documentElement.style.setProperty("--bg", "#090607");
    capturedTerminalOptions = null;
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div
          className="notes-v2"
          style={
            {
              "--notes-pane": "#f4f7f1",
              "--notes-text": "#233229",
            } as CSSProperties
          }
        >
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(capturedTerminalOptions).not.toBeNull());
    const terminalOptions = capturedTerminalOptions as CapturedTerminalOptions | null;

    expect(terminalOptions?.theme?.background).toBe("#f4f7f1");
    expect(terminalOptions?.theme?.foreground).toBe("#233229");
  });

  it("rejects a transparent --notes-pane and falls back to a solid color", async () => {
    // In minimal mode globals.css sets --notes-pane: transparent so the
    // surrounding chrome can show through. xterm's canvas renders a
    // transparent background as solid black, which made the terminal look
    // broken. The theme reader must fall through to the next opaque token.
    capturedTerminalOptions = null;
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div
          className="notes-v2 notes-v2--minimal"
          style={
            {
              "--notes-pane": "transparent",
              "--notes-bg": "#ececeb",
              "--notes-text": "#242424",
            } as CSSProperties
          }
        >
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(capturedTerminalOptions).not.toBeNull());
    const terminalOptions = capturedTerminalOptions as CapturedTerminalOptions | null;

    expect(terminalOptions?.theme?.background).not.toBe("transparent");
    // The fallback chain goes --notes-pane -> --notes-surface -> --notes-bg,
    // so a non-transparent --notes-bg should be picked up.
    expect(terminalOptions?.theme?.background).toBe("#ececeb");
    expect(terminalOptions?.theme?.foreground).toBe("#242424");
  });

  it("prefers the explicit terminal background token when available", async () => {
    capturedTerminalOptions = null;
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div
          className="notes-v2 notes-v2--minimal"
          style={
            {
              "--notes-bg": "#ececeb",
              "--notes-pane": "transparent",
              "--notes-terminal-bg": "#dde6d8",
              "--notes-text": "#242424",
            } as CSSProperties
          }
        >
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(capturedTerminalOptions).not.toBeNull());
    const terminalOptions = capturedTerminalOptions as CapturedTerminalOptions | null;

    expect(terminalOptions?.theme?.background).toBe("#dde6d8");
  });

  it("uses the terminal reading ink instead of the editor's stronger ink", async () => {
    const terminal = createTerminalBridge();
    render(<div className="desktop-app-frame"><div className="notes-v2" style={{ "--notes-terminal-bg": "#23262b", "--notes-terminal-fg": "#d6d9de", "--notes-text": "#ffffff" } as CSSProperties}>
      <NotesTerminalPanel commands={[]} compactChrome isDesktopBridgeAvailable terminalBridge={terminal.bridge} />
    </div></div>);
    await waitFor(() => expect(capturedTerminalOptions?.theme).toBeDefined());
    expect(capturedTerminalOptions?.theme?.background).toBe("#23262b");
    expect(capturedTerminalOptions?.theme?.foreground).toBe("#d6d9de");
  });

  it("renders a compact terminal shell without the old panel heading chrome", async () => {
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    expect(
      screen.queryByRole("heading", {
        name: NOTES_UI_COPY.panels.terminal.title,
      }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".notes-v2__terminal-shell"),
    ).not.toBeNull();
  });

  it("starts new renderer session ids after existing backend sessions", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();
    vi.mocked(terminal.bridge.list).mockResolvedValue([
      {
        backend: "pty",
        cols: 80,
        cwd: "C:\\vault",
        id: "notes-term-4",
        rows: 24,
        shell: "C:\\Windows\\System32\\cmd.exe",
      },
    ]);

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "notes-term-4" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "新会话" }));

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ sessionId: "notes-term-5" }),
      ),
    );
  });

  it("stamps new sessions with the active workspace instance", async () => {
    const terminal = createTerminalBridge();

    render(
      <div className="notes-v2">
        <NotesTerminalPanel
          commands={[]}
          isDesktopBridgeAvailable
          terminalBridge={terminal.bridge}
          workspaceInstanceId="path:darwin:/workspace-a"
        />
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "notes-term-1",
          workspaceInstanceId: "path:darwin:/workspace-a",
        }),
      ),
    );
  });

  it("replays buffered backend output when the terminal view attaches", async () => {
    const terminal = createTerminalBridge();
    vi.mocked(terminal.bridge.list).mockResolvedValue([
      {
        backend: "pty",
        cwd: "/workspace-a",
        id: "notes-term-7",
        output: "hidden output\r\n",
        shell: "/bin/zsh",
        workspaceInstanceId: "path:darwin:/workspace-a",
      },
    ]);
    vi.mocked(terminal.bridge.resume).mockResolvedValue({
      backend: "pty",
      cwd: "/workspace-a",
      id: "notes-term-7",
      output: "hidden output\r\n",
      shell: "/bin/zsh",
      workspaceInstanceId: "path:darwin:/workspace-a",
    });

    render(
      <div className="notes-v2">
        <NotesTerminalPanel
          commands={[]}
          isDesktopBridgeAvailable
          terminalBridge={terminal.bridge}
          workspaceInstanceId="path:darwin:/workspace-a"
        />
      </div>,
    );

    await waitFor(() =>
      expect(terminalWrites[0]).toContain("hidden output\r\n"),
    );
  });

  it("restarts an exited terminal session and replays the triggering input", async () => {
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      terminal.emitExit({
        exitCode: 1,
        sessionId: "notes-term-1",
        signal: null,
      });
    });

    expect(terminalInputListeners).toHaveLength(1);

    await act(async () => {
      terminalInputListeners[0]?.("r");
    });

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(2),
    );
    expect(terminal.bridge.resume).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: "notes-term-2",
      }),
    );
    expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-2", "r");
  });

  it("primes pipe-backed sessions with a newline so the shell prompt appears", async () => {
    const terminal = createTerminalBridge("pipe");

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    await waitFor(() =>
      expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-1", "\n"),
    );
  });

  it("normalizes carriage returns before writing user input to pipe-backed sessions", async () => {
    const terminal = createTerminalBridge("pipe");

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      terminalInputListeners[0]?.("echo READY\r");
    });

    await waitFor(() => expect(terminal.bridge.write).toHaveBeenCalledWith(
      "notes-term-1",
      "echo READY\n",
    ));
  });

  it("writes input arriving after pipe startup drains its queue but before React commits", async () => {
    const terminal = createTerminalBridge("pipe");
    terminal.bridge.write = vi.fn(async (_sessionId, data) => {
      if (data === "\n") terminalInputListeners[0]?.("echo READY\r");
    });
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);

    await waitFor(() => expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-1", "echo READY\n"));
    expect(terminal.bridge.write).toHaveBeenCalledTimes(2);
  });

  it.each(["pipe", "pty"] as const)("writes new input while draining restored %s input", async (backend) => {
    const terminal = createTerminalBridge(backend);
    const deferred = createDeferredCreateResult(backend);
    terminal.bridge.resume = vi.fn(() => deferred.promise);
    const first = backend === "pipe" ? "echo FIRST\n" : "echo FIRST\r";
    const next = backend === "pipe" ? "echo NEXT\n" : "echo NEXT\r";
    terminal.bridge.write = vi.fn(async (_sessionId, data) => {
      if (data === first) terminalInputListeners[0]?.("echo NEXT\r");
    });
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    await act(async () => { terminalInputListeners[0]?.("echo FIRST\r"); });
    expect(terminal.bridge.write).not.toHaveBeenCalled();

    await act(async () => { deferred.resolve("notes-term-1"); });
    await waitFor(() => expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-1", next));
    expect(vi.mocked(terminal.bridge.write).mock.calls).toEqual([["notes-term-1", first], ["notes-term-1", next]]);
  });

  it("queues input while the backend is restoring instead of losing the first command", async () => {
    const terminal = createTerminalBridge();
    const deferred = createDeferredCreateResult();
    terminal.bridge.resume = vi.fn(() => deferred.promise);
    render(<NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={terminal.bridge} />);
    await waitFor(() => expect(terminal.bridge.resume).toHaveBeenCalledTimes(1));
    expect(terminalInputListeners).toHaveLength(1);
    await act(async () => { terminalInputListeners[0]("echo FIRST\r"); });
    expect(terminal.bridge.write).not.toHaveBeenCalled();
    await act(async () => { deferred.resolve("notes-term-1"); });
    await waitFor(() => expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-1", "echo FIRST\r"));
  });

  it("keeps reconnecting cleanly across repeated terminal exits", async () => {
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      terminal.emitExit({
        exitCode: 1,
        sessionId: "notes-term-1",
        signal: null,
      });
    });

    await act(async () => {
      terminalInputListeners[0]?.("c");
    });

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(2),
    );
    expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-2", "c");

    await act(async () => {
      terminal.emitExit({
        exitCode: 1,
        sessionId: "notes-term-2",
        signal: null,
      });
    });

    await act(async () => {
      terminalInputListeners[1]?.("d");
    });

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(3),
    );
    expect(terminal.bridge.write).toHaveBeenCalledWith("notes-term-3", "d");
  });

  it("does not start the same terminal session twice while startup is still pending", async () => {
    const terminal = createTerminalBridge();
    const deferredCreate = createDeferredCreateResult();
    terminal.bridge.resume = vi.fn<DesktopTerminalBridge["resume"]>((input) =>
      deferredCreate.promise.then((record) => ({
        ...record,
        cols: input.cols ?? record.cols,
        cwd: input.cwd ?? record.cwd,
        id: input.sessionId ?? record.id,
        rows: input.rows ?? record.rows,
      })),
    );
    const { rerender } = render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
            terminalCwd="C:\\vault"
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    rerender(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
            terminalCwd="C:\\vault\\updated"
          />
        </div>
      </div>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredCreate.resolve("notes-term-1");
      await deferredCreate.promise;
    });

    expect(terminal.bridge.resume).toHaveBeenCalledTimes(1);
  });

  it("detaches without killing a terminal if the panel unmounts during startup", async () => {
    const terminal = createTerminalBridge();
    const deferredCreate = createDeferredCreateResult();
    terminal.bridge.resume = vi.fn<DesktopTerminalBridge["resume"]>((input) =>
      deferredCreate.promise.then((record) => ({
        ...record,
        cols: input.cols ?? record.cols,
        cwd: input.cwd ?? record.cwd,
        id: input.sessionId ?? record.id,
        rows: input.rows ?? record.rows,
      })),
    );
    const view = render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    view.unmount();

    expect(terminal.bridge.kill).not.toHaveBeenCalled();

    await act(async () => {
      deferredCreate.resolve("notes-term-1");
      await deferredCreate.promise;
    });

    expect(terminal.bridge.kill).not.toHaveBeenCalled();
  });

  it("refocuses the active xterm when clicking terminal surface chrome", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );
    await waitFor(() => expect(terminalFocusSpies[0]).toBeDefined());
    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );
    await act(async () => Promise.resolve());

    const focusSpy = terminalFocusSpies[0];
    expect(focusSpy).toBeDefined();
    focusSpy?.mockClear();

    await user.click(document.querySelector(".notes-v2__terminal-surface") as Element);

    expect(focusSpy).toHaveBeenCalled();
  });

  it("opens terminal edit actions from the context menu", async () => {
    const terminal = createTerminalBridge();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
      {
        clientX: 48,
        clientY: 64,
      },
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Paste" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Select All" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear" })).toBeInTheDocument();
  });

  it("copies the active terminal selection from the context menu", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();
    terminalSelection = "hello terminal\r\n";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => ""),
        writeText: vi.fn(async () => undefined),
      },
    });

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "hello terminal",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("falls back to the desktop clipboard when browser copy is rejected", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();
    const desktopWriteText = vi.fn(async () => undefined);
    terminalSelection = "native clipboard fallback\r\n";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => ""),
        writeText: vi.fn(async () => {
          throw new Error("Document is not focused");
        }),
      },
    });
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: {
        clipboard: {
          writeText: desktopWriteText,
        },
      },
    });

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));

    await waitFor(() =>
      expect(desktopWriteText).toHaveBeenCalledWith(
        "native clipboard fallback",
      ),
    );
    expect(screen.queryByText("Clipboard copy failed.")).not.toBeInTheDocument();
  });

  it("reports copy failure when browser and desktop clipboard writes fail", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();
    terminalSelection = "uncopyable text\r\n";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => ""),
        writeText: vi.fn(async () => {
          throw new Error("Document is not focused");
        }),
      },
    });
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn(async () => {
            throw new Error("Native clipboard unavailable");
          }),
        },
      },
    });

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(await screen.findByText("Clipboard copy failed.")).toBeInTheDocument();
  });

  it("pastes clipboard text into the active running terminal", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => "npm test"),
        writeText: vi.fn(async () => undefined),
      },
    });

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(terminal.bridge.resume).toHaveBeenCalledTimes(1),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Paste" }));

    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
    expect(terminalPasteSpies[0]).toHaveBeenCalledWith("npm test");
    expect(terminal.bridge.write).toHaveBeenCalledWith(
      "notes-term-1",
      "npm test",
    );
  });

  it("selects all and clears the active terminal from the context menu", async () => {
    const terminal = createTerminalBridge();
    const user = userEvent.setup();

    render(
      <div className="desktop-app-frame">
        <div className="notes-v2">
          <NotesTerminalPanel
            commands={[]}
            isDesktopBridgeAvailable
            terminalBridge={terminal.bridge}
          />
        </div>
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Select All" }));
    expect(terminalSelectAllSpies[0]).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(
      document.querySelector(".notes-v2__terminal-surface") as Element,
    );
    await user.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(terminalClearSpies[0]).toHaveBeenCalledTimes(1);
  });
});
