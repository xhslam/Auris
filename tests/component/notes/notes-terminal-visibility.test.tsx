import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DesktopTerminalBridge, DesktopTerminalSessionRecord } from "@/platform/desktop/desktop-bridge";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";

const terminalHarness = vi.hoisted(() => {
  let resolveImport!: () => void;
  const importGate = new Promise<void>((resolve) => { resolveImport = resolve; });
  return {
    importGate,
    resolveImport: () => resolveImport(),
    importRequested: vi.fn(),
    focus: vi.fn(),
    fit: vi.fn(),
    dispose: vi.fn(),
    input: null as ((data: string) => void) | null,
  };
});

vi.mock("@xterm/xterm", async () => {
  terminalHarness.importRequested();
  await terminalHarness.importGate;
  return {
    Terminal: class {
      cols = 80;
      rows = 24;
      unicode = { activeVersion: "" };
      options: object;
      constructor(options: object) { this.options = options; }
      loadAddon() {}
      attachCustomKeyEventHandler() {}
      open(container: HTMLElement) {
        const screen = document.createElement("div");
        screen.dataset.testid = "delayed-terminal-screen";
        container.appendChild(screen);
      }
      onData(listener: (data: string) => void) { terminalHarness.input = listener; }
      focus = terminalHarness.focus;
      dispose = terminalHarness.dispose;
      write() {}
    },
  };
});
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit = terminalHarness.fit; } }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: class { clearDecorations() {} } }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));

describe("deferred terminal visibility", () => {
  it("finishes an activation hidden during import/resume and reopens the same screen", async () => {
    let resolveResume!: (record: DesktopTerminalSessionRecord) => void;
    const resumeGate = new Promise<DesktopTerminalSessionRecord>((resolve) => { resolveResume = resolve; });
    let resolveList!: (records: DesktopTerminalSessionRecord[]) => void;
    const listGate = new Promise<DesktopTerminalSessionRecord[]>((resolve) => { resolveList = resolve; });
    const bridge: DesktopTerminalBridge = {
      create: vi.fn(), list: vi.fn(() => listGate),
      resume: vi.fn(() => resumeGate), resize: vi.fn().mockResolvedValue(undefined),
      kill: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}),
    };
    const panel = (visible: boolean) => (
      <div className="notes-v2"><NotesTerminalPanel commands={[]} isDesktopBridgeAvailable terminalBridge={bridge} visible={visible} /></div>
    );
    const view = render(panel(true));
    await waitFor(() => expect(terminalHarness.importRequested).toHaveBeenCalledTimes(1));
    expect(bridge.resume).not.toHaveBeenCalled();
    await act(async () => { resolveList([]); await listGate; });
    await screen.findByRole("tab", { selected: true });
    expect(bridge.resume).not.toHaveBeenCalled();

    // The dynamic xterm import is still pending when the pane closes.
    view.rerender(panel(false));
    await act(async () => { terminalHarness.resolveImport(); });
    await waitFor(() => expect(bridge.resume).toHaveBeenCalledTimes(1));
    expect(terminalHarness.focus).not.toHaveBeenCalled();
    expect(terminalHarness.fit).not.toHaveBeenCalled();
    const screenElement = screen.getByTestId("delayed-terminal-screen");
    terminalHarness.input?.("echo QUEUED\r");
    const id = vi.mocked(bridge.resume).mock.calls[0][0].sessionId!;
    await act(async () => {
      resolveResume({ backend: "pty", cols: 80, rows: 24, cwd: null, id, shell: "/bin/zsh" });
      await resumeGate;
    });
    expect(bridge.write).toHaveBeenCalledExactlyOnceWith(id, "echo QUEUED\r");
    expect(terminalHarness.focus).not.toHaveBeenCalled();
    expect(bridge.resize).not.toHaveBeenCalled();
    view.rerender(panel(true));
    await waitFor(() => expect(terminalHarness.focus).toHaveBeenCalled());
    expect(screen.getByTestId("delayed-terminal-screen")).toBe(screenElement);
    expect(screenElement.parentElement?.style.display).toBe("block");
    expect(bridge.resume).toHaveBeenCalledTimes(1);
    expect(bridge.kill).not.toHaveBeenCalled();
    expect(terminalHarness.dispose).not.toHaveBeenCalled();
  });
});
