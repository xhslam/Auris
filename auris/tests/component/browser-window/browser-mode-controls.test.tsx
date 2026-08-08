import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserToolbar } from "@/components/browser-window/browser-toolbar";
import { BrowserStatusPill } from "@/components/browser-window/browser-status-pill";

describe("browser mode controls", () => {
  it("projects the immutable active tab mode in the status pill", () => {
    const { rerender } = render(<BrowserStatusPill mode="Human" />);
    expect(screen.getByText("人工浏览")).toBeInTheDocument();
    rerender(<BrowserStatusPill mode="AiSandbox" />);
    expect(screen.getByText("AI 沙盒")).toBeInTheDocument();
    rerender(<BrowserStatusPill mode="AiShared" />);
    expect(screen.getByText("AI 共用")).toBeInTheDocument();
  });

  it("creates a new tab for the selected mode instead of relabeling the live tab", async () => {
    const user = userEvent.setup();
    const onCreateTab = vi.fn();
    render(
      <BrowserToolbar
        address="https://example.com"
        bookmarked={false}
        loading={false}
        mode="Human"
        onAddressChange={() => undefined}
        onAddressSubmit={() => undefined}
        onBack={() => undefined}
        onBookmark={() => undefined}
        onCreateTab={onCreateTab}
        onForward={() => undefined}
        onReload={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(document.querySelector('.browser-status-pill[data-mode="Human"]')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("新建标签模式"), "AiSandbox");
    expect(onCreateTab).toHaveBeenCalledWith("AiSandbox");
    await user.selectOptions(screen.getByLabelText("新建标签模式"), "AiShared");
    expect(onCreateTab).toHaveBeenCalledWith("AiShared");
  });
});
