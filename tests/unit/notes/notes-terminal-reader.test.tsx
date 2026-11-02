import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import { NotesTerminalReader } from "@/components/notes-v2/terminal/notes-terminal-reader";
import type { DesktopTerminalBridge } from "@/platform/desktop/desktop-bridge";

describe("NotesTerminalReader", () => {
  let mockBridge: DesktopTerminalBridge;
  let mockReadTranscript: ReturnType<typeof vi.fn>;
  let mockResize: ReturnType<typeof vi.fn>;
  let agentStateCallback: ((event: { sessionId: string; agentState: string }) => void) | null = null;

  beforeEach(() => {
    mockReadTranscript = vi.fn().mockResolvedValue({
      revision: "rev-1",
      messages: [
        {
          id: "turn-1",
          text: "Here is the response with [Safe Link](https://example.com) and [Dangerous Link](javascript:alert(1)) and an image: ![Cat](https://example.com/cat.png)\n\n```ts\nconst x = 42;\n```",
          userPrompt: "How do I do X?",
          toolCalls: ["read_file", "run_command"],
        },
      ],
    });
    mockResize = vi.fn().mockResolvedValue({ ok: true });

    mockBridge = {
      readTranscript: mockReadTranscript,
      resize: mockResize,
      onAgentState: vi.fn((cb) => {
        agentStateCallback = cb;
        return () => {
          agentStateCallback = null;
        };
      }),
    } as unknown as DesktopTerminalBridge;

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    (window as unknown as { shadowingDesktop?: { system?: { openExternal?: ReturnType<typeof vi.fn> } } }).shadowingDesktop = {
      system: {
        openExternal: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders user prompt, tool calls summary, and assistant markdown content", async () => {
    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        onClose={vi.fn()}
      />
    );

    // Wait for content to render
    await waitFor(() => {
      expect(screen.getByText("User Prompt")).toBeInTheDocument();
    });
    expect(screen.getByText("How do I do X?")).toBeInTheDocument();

    // Check tool calls summary
    const toolsSummary = screen.getByText("运行了 2 个工具");
    expect(toolsSummary).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("run_command")).toBeInTheDocument();

    // Check safe link rendered as anchor
    const safeLink = screen.getByRole("link", { name: "Safe Link" });
    expect(safeLink).toHaveAttribute("href", "https://example.com");

    // Click safe link should invoke system.openExternal
    fireEvent.click(safeLink);
    expect(
      (window as unknown as { shadowingDesktop: { system: { openExternal: ReturnType<typeof vi.fn> } } })
        .shadowingDesktop.system.openExternal
    ).toHaveBeenCalledWith("https://example.com");

    // Check javascript: link is NOT rendered as anchor (only span)
    expect(screen.queryByRole("link", { name: "Dangerous Link" })).toBeNull();
    expect(screen.getByText("Dangerous Link")).toBeInTheDocument();
  });

  it("defers remote image loading until user clicks the placeholder", async () => {
    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        onClose={vi.fn()}
      />
    );

    const placeholder = await screen.findByRole("button", { name: /点击加载图片：Cat/ });
    expect(placeholder).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Cat" })).toBeNull();

    // Click placeholder to load
    fireEvent.click(placeholder);
    const img = screen.getByRole("img", { name: "Cat" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/cat.png");
  });

  it("copies code and copy markdown on click", async () => {
    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        onClose={vi.fn()}
      />
    );

    const codeCopyBtn = await screen.findByTitle("复制代码");
    await act(async () => {
      fireEvent.click(codeCopyBtn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const x = 42;");

    // Markdown copy
    const turnCopyBtn = screen.getByRole("button", { name: "复制为 Markdown" });
    await act(async () => {
      fireEvent.click(turnCopyBtn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Here is the response")
    );
  });

  it("exits reading mode on Escape key and Mod+Alt+R shortcut", async () => {
    const handleClose = vi.fn();
    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        onClose={handleClose}
      />
    );

    await screen.findByText("User Prompt");

    // Press Escape (120ms fade-out before onClose)
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(handleClose).toHaveBeenCalledTimes(1));

    // Press Mod+Alt+R (metaKey + altKey + 'r')
    fireEvent.keyDown(window, { key: "r", altKey: true, metaKey: true });
    await waitFor(() => expect(handleClose).toHaveBeenCalledTimes(2));

    // Clicking top-left "返回终端" button
    const backBtn = screen.getByRole("button", { name: /返回终端/ });
    fireEvent.click(backBtn);
    await waitFor(() => expect(handleClose).toHaveBeenCalledTimes(3));
  });

  it("shows waiting banner when agentState is waiting and hides when left waiting", async () => {
    const { rerender } = render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        agentState="idle"
        onClose={vi.fn()}
      />
    );

    await screen.findByText("User Prompt");
    expect(screen.queryByText("等待你确认 · 按 Esc 回到终端")).toBeNull();

    // Transition to 'waiting' via bridge event
    act(() => {
      agentStateCallback?.({ sessionId: "session-1", agentState: "waiting" });
    });
    expect(screen.getByText("等待你确认 · 按 Esc 回到终端")).toBeInTheDocument();

    // Transition to 'working'
    act(() => {
      agentStateCallback?.({ sessionId: "session-1", agentState: "working" });
    });
    expect(screen.queryByText("等待你确认 · 按 Esc 回到终端")).toBeNull();

    // Rerender with initial waiting prop
    act(() => {
      rerender(
        <NotesTerminalReader
          bridge={mockBridge}
          sessionId="session-1"
          active={true}
          agentState="waiting"
          onClose={vi.fn()}
        />
      );
    });
    expect(screen.getByText("等待你确认 · 按 Esc 回到终端")).toBeInTheDocument();
  });

  it("renders latest 50 turns by default and expands on clicking load more", async () => {
    const manyMessages = Array.from({ length: 65 }, (_, i) => ({
      id: `turn-${i}`,
      text: `Message content ${i}`,
    }));
    mockReadTranscript.mockResolvedValueOnce({
      revision: "rev-many",
      messages: manyMessages,
    });

    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-1"
        active={true}
        onClose={vi.fn()}
      />
    );

    await screen.findByText("Message content 64");
    // Message 0 should not be in the document because visibleCount is 50 (messages 15..64 are shown)
    expect(screen.queryByText("Message content 0")).toBeNull();
    expect(screen.getByText("Message content 15")).toBeInTheDocument();

    // Load more button
    const loadMoreBtn = screen.getByRole("button", {
      name: /加载更早的记录（共 65 轮，已显示最近 50 轮）/,
    });
    expect(loadMoreBtn).toBeInTheDocument();

    // Click load more
    fireEvent.click(loadMoreBtn);
    expect(screen.getByText("Message content 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /加载更早的记录/ })).toBeNull();
  });

  it("displays restrained notice without unhandled errors when readTranscript fails", async () => {
    mockReadTranscript.mockRejectedValueOnce(new Error("File not found or permission denied"));

    render(
      <NotesTerminalReader
        bridge={mockBridge}
        sessionId="session-err"
        active={true}
        onClose={vi.fn()}
      />
    );

    const notice = await screen.findByText("暂无执行记录或记录不可用");
    expect(notice).toBeInTheDocument();
  });

  it("refreshes on agent state done/working and never calls resize IPC", async () => {
    vi.useFakeTimers();
    try {
      render(
        <NotesTerminalReader
          bridge={mockBridge}
          sessionId="session-1"
          active={true}
          onClose={vi.fn()}
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(mockReadTranscript).toHaveBeenCalledTimes(1);

      // Trigger agent state 'working'
      await act(async () => {
        agentStateCallback?.({ sessionId: "session-1", agentState: "working" });
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(mockReadTranscript).toHaveBeenCalledTimes(2);

      // Advance 5s for fallback polling
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockReadTranscript).toHaveBeenCalledTimes(3);

      // Ensure mockResize was never called during the reading mode lifecycle
      expect(mockResize).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
