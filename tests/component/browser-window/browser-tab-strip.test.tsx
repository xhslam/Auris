import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserTabStrip } from "@/components/browser-window/browser-tab-strip";
import type { BrowserChromeTab } from "@/features/browser/browser-bridge";

const tabs: BrowserChromeTab[] = [
  {
    active: true,
    automationMode: "Human",
    lifecycle: "ready",
    loading: false,
    navigationGeneration: 0,
    tabId: "tab-1",
    title: "New Tab",
    url: "",
  },
  {
    active: false,
    automationMode: "Human",
    lifecycle: "ready",
    loading: false,
    navigationGeneration: 0,
    tabId: "tab-2",
    title: "Reference",
    url: "https://example.com",
  },
];

describe("BrowserTabStrip", () => {
  it("keeps each close control inside its tab content and isolates close clicks", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <BrowserTabStrip
        activeTabId="tab-1"
        onActivate={onActivate}
        onClose={onClose}
        onCreate={() => undefined}
        tabs={tabs}
      />,
    );

    const close = screen.getByRole("button", { name: "关闭 New Tab" });
    const tab = screen.getByRole("tab", { name: "New Tab" }).closest(".browser-tab");

    expect(close.parentElement).toHaveClass("browser-tab__content");
    expect(tab).toContainElement(close);
    await user.click(close);

    expect(onClose).toHaveBeenCalledWith("tab-1");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("keeps close hit areas mounted for inactive tabs without changing tab activation", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <BrowserTabStrip
        activeTabId="tab-1"
        onActivate={onActivate}
        onClose={onClose}
        onCreate={() => undefined}
        tabs={tabs}
      />,
    );

    const referenceClose = screen.getByRole("button", { name: "关闭 Reference" });
    expect(referenceClose).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reference" }));

    expect(onActivate).toHaveBeenCalledWith("tab-2");
    expect(onClose).not.toHaveBeenCalled();
  });
});
