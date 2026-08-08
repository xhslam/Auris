import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NiaPanel } from "@/components/nia/nia-panel";
import { createBrowserReferenceContext } from "@/features/nia/nia-context";
import type { NiaProviderEvent } from "@/features/nia/nia-bridge";

function hostFixture() {
  let listener: ((event: NiaProviderEvent) => void) | null = null;
  const invoke = vi.fn(async (command: string) => {
    if (command === "listProviders") {
      return {
        activeProviderId: "p1",
        providers: [{
          id: "p1",
          label: "Local",
          kind: "rest",
          enabled: true,
          defaultModel: "model-a",
          supportedModels: ["model-a"],
        }],
      };
    }
    if (command === "start") return { runId: "run-1", providerId: "p1", model: "model-a", ownerWebContentsId: 1 };
    return true;
  });
  return {
    host: {
      aurisNia: {
        invoke,
        subscribe: (next: (event: NiaProviderEvent) => void) => { listener = next; return true; },
        unsubscribe: () => { listener = null; return true; },
      },
    },
    invoke,
    emit: (event: NiaProviderEvent) => listener?.(event),
  };
}

describe("Nia panel", () => {
  beforeEach(() => window.localStorage.clear());

  it("submits through the narrow bridge, streams output, retries, and stops", async () => {
    const user = userEvent.setup();
    const fixture = hostFixture();
    render(<NiaPanel host={fixture.host} />);
    await waitFor(() => expect(screen.getByLabelText("Nia prompt")).toBeEnabled());
    await user.type(screen.getByLabelText("Nia prompt"), "Summarize this");
    await user.click(screen.getByRole("button", { name: "Send · 发送" }));
    await waitFor(() => expect(fixture.invoke).toHaveBeenCalledWith("start", expect.objectContaining({
      prompt: "Summarize this",
      providerId: "p1",
      modelOverride: "model-a",
    })));
    await user.click(screen.getByRole("button", { name: "Stop · 停止" }));
    await waitFor(() => expect(fixture.invoke).toHaveBeenCalledWith("cancel", { runId: "run-1" }));
    fixture.emit({ type: "delta", runId: "run-1", text: "Hel" });
    fixture.emit({ type: "completed", runId: "run-1", text: "Hello" });
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry · 重试" }));
    expect(fixture.invoke.mock.calls.filter((call) => call[0] === "start")).toHaveLength(2);
  });

  it("attaches browser context only after an explicit click and sanitizes Markdown", async () => {
    const user = userEvent.setup();
    const fixture = hostFixture();
    const onRequestContext = vi.fn(() => createBrowserReferenceContext({
      title: "Example",
      url: "https://example.com",
    }));
    render(
      <NiaPanel
        host={fixture.host}
        onRequestContext={onRequestContext}
        supportedContexts={["browser"]}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("Nia prompt")).toBeEnabled());
    expect(onRequestContext).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Attach browser · 页面" }));
    await user.type(screen.getByLabelText("Nia prompt"), "Read reference");
    await user.click(screen.getByRole("button", { name: "Send · 发送" }));
    expect(fixture.invoke).toHaveBeenCalledWith("start", expect.objectContaining({
      prompt: expect.stringContaining("Explicit browser reference"),
    }));
    expect(fixture.invoke).toHaveBeenCalledWith("start", expect.not.objectContaining({
      enableBrowserTools: true,
    }));
    fixture.emit({
      type: "completed",
      runId: "run-1",
      text: "**safe** <script>alert(1)</script>",
    });
    expect(await screen.findByText("safe")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("opts into host browser tools with the active tab target", async () => {
    const user = userEvent.setup();
    const fixture = hostFixture();
    render(
      <NiaPanel
        browserTarget={{ windowId: "w1", tabId: "t1" }}
        host={fixture.host}
        supportedContexts={["browser"]}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("Nia prompt")).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Allow browser automation/u }));
    await user.type(screen.getByLabelText("Nia prompt"), "Open docs");
    await user.click(screen.getByRole("button", { name: "Send · 发送" }));
    expect(fixture.invoke).toHaveBeenCalledWith("start", expect.objectContaining({
      prompt: "Open docs",
      enableBrowserTools: true,
      browserTarget: { windowId: "w1", tabId: "t1" },
    }));
    fixture.emit({
      type: "tool",
      runId: "run-1",
      name: "auris_browser",
      action: "open",
      status: "started",
    });
    expect(await screen.findByText(/Browser · open/u)).toBeInTheDocument();
  });

  it("surfaces provider failure and keeps copyable, navigable history only after opt-in", async () => {
    const user = userEvent.setup();
    const fixture = hostFixture();
    render(<NiaPanel host={fixture.host} />);
    await waitFor(() => expect(screen.getByLabelText("Nia prompt")).toBeEnabled());

    await user.type(screen.getByLabelText("Nia prompt"), "First request");
    await user.click(screen.getByRole("button", { name: "Send · 发送" }));
    fixture.emit({ type: "failed", runId: "run-1", message: "Provider offline" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider offline");
    expect(screen.queryByText("History")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Save local history · 保存本地会话" }));
    await user.type(screen.getByLabelText("Nia prompt"), "Saved request");
    await user.click(screen.getByRole("button", { name: "Send · 发送" }));
    fixture.emit({ type: "completed", runId: "run-1", text: "Saved response" });
    expect(await screen.findByText("Saved response")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy · 复制" }));
    expect(await navigator.clipboard.readText()).toBe("Saved response");

    await user.click(screen.getByText("History"));
    await user.click(screen.getByRole("button", { name: "Saved request" }));
    expect(screen.getByLabelText("Nia response")).toHaveTextContent("Saved response");
  });

  it("guides configuration when the bridge is present but no providers exist", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "listProviders") return { activeProviderId: null, providers: [] };
      return true;
    });
    render(
      <NiaPanel
        host={{
          aurisNia: {
            invoke,
            subscribe: () => true,
            unsubscribe: () => true,
          },
        }}
      />,
    );
    expect(await screen.findByText(/Configure a provider above to start/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Nia prompt")).toBeDisabled();
  });
});
