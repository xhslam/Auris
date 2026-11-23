import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NiaTranscriptionPanel } from "@/components/nia/nia-transcription-panel";

function bridgeFixture() {
  let listener: ((event: unknown) => void) | null = null;
  const invoke = vi.fn(async () => true);
  Object.defineProperty(window, "shadowingDesktop", { configurable: true, value: { niaCompanion: {
    invoke,
    subscribe: vi.fn((next: (event: unknown) => void) => { listener = next; return true; }),
    unsubscribe: vi.fn(),
  } } });
  return { invoke, report: (report: unknown) => act(() => { listener?.({ type: "report", report }); }) };
}

afterEach(() => { Reflect.deleteProperty(window, "shadowingDesktop"); });

describe("Nia realtime transcription controls", () => {
  it("does not start on mount and requires explicit cloud/participant consent", async () => {
    const s = bridgeFixture();
    render(<NiaTranscriptionPanel state="resting" muted={false} />);
    expect(s.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "开始转写" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "开始转写" }));
    await waitFor(() => expect(s.invoke).toHaveBeenCalledExactlyOnceWith("wake", { mode: "transcription" }));
    expect(screen.getByText(/不保存录音/)).toBeInTheDocument();
  });

  it("offers explicit pause/resume and stop while recording", async () => {
    const s = bridgeFixture();
    const view = render(<NiaTranscriptionPanel state="listening" muted={false} />);
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    await waitFor(() => expect(s.invoke).toHaveBeenCalledWith("mute", { muted: true }));
    view.rerender(<NiaTranscriptionPanel state="listening" muted />);
    fireEvent.click(screen.getByRole("button", { name: "继续转写" }));
    await waitFor(() => expect(s.invoke).toHaveBeenCalledWith("mute", { muted: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "结束转写" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "结束转写" }));
    await waitFor(() => expect(s.invoke).toHaveBeenCalledWith("rest", expect.anything()));
  });

  it("replaces draft text with confirmed text without duplication and labels partial tail text", () => {
    const s = bridgeFixture();
    render(<NiaTranscriptionPanel state="listening" muted={false} />);
    s.report({ type: "hearing", itemId: "one", text: "你好" });
    expect(screen.getByText("你好")).toBeInTheDocument();
    s.report({ type: "heard", itemId: "one", text: "你好啊", at: Date.now() });
    expect(screen.queryByText("你好", { exact: true })).not.toBeInTheDocument();
    s.report({ type: "heard", itemId: "one", text: "你好啊", at: Date.now() });
    expect(screen.getAllByText("你好啊")).toHaveLength(1);
    s.report({ type: "heard", itemId: "two", text: "未完", cut: true });
    expect(screen.getByText("（结束时的未确认片段）")).toBeInTheDocument();
  });

  it("shows failures instead of pretending transcription started", async () => {
    const s = bridgeFixture();
    s.invoke.mockRejectedValueOnce(new Error("offline"));
    render(<NiaTranscriptionPanel state="resting" muted={false} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "开始转写" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("操作失败"));
  });
});
