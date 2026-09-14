import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NiaConversationArchive } from "@/components/nia/nia-conversation-archive";

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));
const invoke = host.invoke;

vi.mock("@/features/nia/nia-companion-bridge", () => ({
  getNiaCompanionHostBridge: () => host,
}));

describe("NiaConversationArchive", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((command: string) => {
      if (command === "conversations") {
        return Promise.resolve([
          {
            endedAt: "2026-09-02T12:09:00.000Z",
            id: "conversation-1",
            opening: "欢迎回来，我们继续复习中值定理。",
            startedAt: "2026-09-02T12:01:00.000Z",
            turnCount: 2,
          },
        ]);
      }
      if (command === "conversation-detail") {
        return Promise.resolve({
          tools: [{ at: "2026-09-02T12:02:00.000Z", callId: "tool-1", name: "recall_conversations", status: "completed" }],
          turns: [
            { at: "2026-09-02T12:01:31.000Z", id: "turn-1", speaker: "nia", text: "欢迎回来，我们继续复习中值定理。" },
            { at: "2026-09-02T12:02:11.000Z", id: "turn-2", speaker: "user", text: "先帮我回顾核心条件。" },
          ],
        });
      }
      if (command === "conversation-search") {
        return Promise.resolve([{ at: "2026-09-02T12:01:31.000Z", conversationId: "conversation-1", speaker: "nia", startedAt: "2026-09-02T12:01:00.000Z", text: "欢迎回来，我们继续复习中值定理。", turnId: "turn-1" }]);
      }
      return Promise.resolve(null);
    });
  });

  it("opens the newest populated local day and renders the saved transcript with tool history", async () => {
    render(<NiaConversationArchive onClose={vi.fn()} />);

    expect(await screen.findByText(/9月2日星期三/)).toBeInTheDocument();
    const entry = screen.getByRole("button", { name: /欢迎回来，我们继续复习中值定理/ });
    fireEvent.click(entry);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("conversation-detail", { conversationId: "conversation-1" }));
    expect(await screen.findByText("先帮我回顾核心条件。")).toBeInTheDocument();
    expect(screen.getByText("recall_conversations")).toBeInTheDocument();
    expect(screen.getByText("先帮我回顾核心条件。").closest(".nia-archive__turn")).toHaveClass("nia-archive__turn--user");
  });

  it("searches the complete archive rather than only the selected day", async () => {
    render(<NiaConversationArchive onClose={vi.fn()} />);
    await screen.findByText(/9月2日星期三/);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索全部 Nia 对话" }), { target: { value: "中值定理" } });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("conversation-search", { query: "中值定理" }));
    expect(await screen.findByText("搜索结果")).toBeInTheDocument();
  });

  it("opens a conversation selected from the compact side panel", async () => {
    render(<NiaConversationArchive initialConversationId="conversation-1" onClose={vi.fn()} />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("conversation-detail", { conversationId: "conversation-1" }));
    expect(await screen.findByText("先帮我回顾核心条件。")).toBeInTheDocument();
  });
});
