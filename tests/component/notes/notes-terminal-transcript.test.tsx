import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesTerminalTranscript } from "@/components/notes-v2/terminal/notes-terminal-transcript";
import type { DesktopTerminalBridge } from "@/platform/desktop/desktop-bridge";
beforeEach(() => { vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList); });
afterEach(() => { vi.restoreAllMocks(); });
function bridge(overrides: Partial<DesktopTerminalBridge> = {}) {
  return { transcriptStatus: vi.fn().mockResolvedValue({ enabled: true }), configureTranscript: vi.fn().mockResolvedValue({ enabled: true }), readTranscript: vi.fn().mockResolvedValue(null), ...overrides } as unknown as DesktopTerminalBridge;
}
describe("terminal transcript preview", () => {
  it("requires an explicit enable action, explaining local hook configuration before changing it", async () => {
    const api = bridge({ transcriptStatus: vi.fn().mockResolvedValue({ enabled: false }) });
    render(<NotesTerminalTranscript bridge={api} sessionId="one" id="tx" />);
    const enable = await screen.findByRole("button", { name: "开启执行记录" });
    expect(screen.getByText(/保留已有设置/)).toBeInTheDocument();
    expect(screen.getByText(/支持 Codex、Antigravity CLI（agy）和 Claude Code/)).toBeInTheDocument();
    expect(api.configureTranscript).not.toHaveBeenCalled();
    expect(api.readTranscript).not.toHaveBeenCalled();
    fireEvent.click(enable);
    await waitFor(() => expect(api.configureTranscript).toHaveBeenCalledWith(true));
  });
  it("lets existing users update provider hooks explicitly without disabling preview", async () => {
    const api = bridge();
    render(<NotesTerminalTranscript bridge={api} sessionId="one" id="tx" />);
    expect(await screen.findByRole("region", { name: "Agent 执行记录" })).toBeInTheDocument();
    const update = await screen.findByRole("button", { name: "更新 CLI 钩子" });
    expect(api.configureTranscript).not.toHaveBeenCalled();
    fireEvent.click(update);
    await waitFor(() => expect(api.configureTranscript).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
  });
  it("renders tables and escapes raw HTML while leaving images, diagrams and unsafe links inert", async () => {
    const api = bridge({ readTranscript: vi.fn().mockResolvedValue({ revision: "r1", messages: [{ id: "reply", text: '| A | B |\n|---|---|\n| X | Y |\n\n<script>alert(1)</script>\n\n![photo](https://example.com/track)\n\n[bad](javascript:alert(1))\n\n```mermaid\ngraph TD; A-->B\n```' }] }) });
    const { container } = render(<NotesTerminalTranscript bridge={api} sessionId="one" id="tx" />);
    expect(await screen.findByRole("table")).toHaveTextContent("X");
    expect(container.querySelector("img,script,iframe,svg")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText("graph TD; A-->B")).toBeInTheDocument();
  });
  it("discards responses from the previous terminal and clears them immediately on session switch", async () => {
    let resolveFirst!: (value: unknown) => void;
    const api = bridge({ readTranscript: vi.fn().mockImplementation((sessionId: string) => sessionId === "one" ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(null)) });
    const { rerender } = render(<NotesTerminalTranscript bridge={api} sessionId="one" id="tx" />);
    await waitFor(() => expect(api.readTranscript).toHaveBeenCalledWith("one", undefined));
    rerender(<NotesTerminalTranscript bridge={api} sessionId="two" id="tx" />);
    await act(async () => { resolveFirst({ revision: "old", messages: [{ id: "old", text: "old terminal" }] }); });
    expect(screen.queryByText("old terminal")).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("当前终端");
  });
  it("does not read while the terminal is hidden", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    const api = bridge();
    render(<NotesTerminalTranscript bridge={api} sessionId="one" id="tx" />);
    await screen.findByText(/等待当前终端/);
    expect(api.readTranscript).not.toHaveBeenCalled();
  });
});
