import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NiaConversationPanel } from "@/components/nia/nia-conversation-panel";

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/features/nia/nia-companion-bridge", () => ({
  getNiaCompanionHostBridge: () => host,
}));

describe("NiaConversationPanel", () => {
  beforeEach(() => {
    host.invoke.mockReset();
    host.invoke.mockResolvedValue([
      {
        endedAt: "2026-09-03T02:20:00.000Z",
        id: "newer",
        opening: "继续复习线性代数",
        startedAt: "2026-09-03T02:10:00.000Z",
        turnCount: 4,
      },
      {
        endedAt: "2026-09-02T02:20:00.000Z",
        id: "older",
        opening: "回顾昨天的单词",
        startedAt: "2026-09-02T02:10:00.000Z",
        turnCount: 2,
      },
    ]);
  });

  it("renders actual recent conversations and opens the selected record", async () => {
    const onOpenArchive = vi.fn();
    render(<NiaConversationPanel onOpenArchive={onOpenArchive} />);

    expect(await screen.findByText("继续复习线性代数")).toBeInTheDocument();
    expect(host.invoke).toHaveBeenCalledWith("conversations");

    fireEvent.click(screen.getByRole("button", { name: /继续复习线性代数/ }));
    expect(onOpenArchive).toHaveBeenCalledWith("newer");

    fireEvent.click(screen.getByRole("button", { name: /查看完整记录/ }));
    expect(onOpenArchive).toHaveBeenLastCalledWith();
  });
});
