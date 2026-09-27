import type { CSSProperties } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";
import type {
  DesktopTerminalBridge,
  DesktopTerminalExitEvent,
} from "@/platform/desktop/desktop-bridge";

type CapturedTerminalOptions = {
  fontFamily?: string;
  theme?: {
    background?: string;
    cursor?: string;
    foreground?: string;
  };
};

let capturedTerminalOptions: CapturedTerminalOptions | null = null;
const terminalInputListeners: Array<(data: string) => void> = [];
const terminalClearSpies: Array<Mock<() => void>> = [];
const terminalFocusSpies: Array<Mock<() => void>> = [];
const terminalSelectAllSpies: Array<Mock<() => void>> = [];
const terminalKeyHandlers: Array<(event: KeyboardEvent) => boolean> = [];
const terminalWrites: string[][] = [];
let terminalSelection = "";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    unicode = {
      activeVersion: "",
    };
    writeIndex = 0;

    constructor(options: CapturedTerminalOptions) {
      capturedTerminalOptions = options;
      terminalClearSpies.push(vi.fn<() => void>());
      terminalFocusSpies.push(vi.fn<() => void>());
      terminalSelectAllSpies.push(vi.fn<() => void>());
      this.writeIndex = terminalWrites.push([]) - 1;
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalKeyHandlers.push(handler);
      return undefined;
    }

    hasSelection() {
      return terminalSelection.length > 0;
    }

    clear() {
      terminalClearSpies.at(-1)?.();
      return undefined;
    }

    dispose() {
      return undefined;
    }

    focus() {
      terminalFocusSpies.at(-1)?.();
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
      return {
        dispose() {},
      };
    }

    open(container: HTMLElement) {
      const stub = document.createElement("div");
      stub.dataset.testid = "xterm-stub";
      container.appendChild(stub);
    }

    selectAll() {
      terminalSelectAllSpies.at(-1)?.();
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
    fit() {
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
};

function createTerminalBridge(
  backend: "pipe" | "pty" = "pty",
): TerminalBridgeHarness {
  let exitListener: ((event: DesktopTerminalExitEvent) => void) | null = null;
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
      onData: vi.fn(() => () => undefined),
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
  };
}

function createDeferredCreateResult() {
  let resolve: ((sessionId: string) => void) | null = null;

  return {
    promise: new Promise<{
      backend: "pty";
      cols: number;
      cwd: string | null;
      id: string;
      rows: number;
      shell: string;
    }>((nextResolve) => {
      resolve = (sessionId: string) =>
        nextResolve({
          backend: "pty",
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

    expect(terminal.bridge.write).toHaveBeenCalledWith(
      "notes-term-1",
      "echo READY\n",
    );
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
