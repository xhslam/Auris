import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserApprovalDialog } from "@/components/browser-window/browser-approval-dialog";
import type {
  BrowserChromeSnapshot,
  BrowserNativeBridge,
} from "@/features/browser/browser-bridge";

describe("BrowserApprovalDialog", () => {
  afterEach(() => delete window.aurisBrowser);

  it("renders only the safe descriptor and sends exact allow-once or deny decisions", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    render(<BrowserApprovalDialog />);

    expect(await screen.findByRole("dialog", { name: "浏览器操作确认" })).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("输入内容")).toBeInTheDocument();
    expect(screen.queryByText(/private|payload|selector/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "仅允许这一次" }));
    expect(fixture.invoke).toHaveBeenCalledWith("resolveApproval", {
      approvalId: "approval-one",
      decision: "allow_once",
    });

    act(() => fixture.emit(snapshot("approval-two")));
    await waitFor(() => expect(screen.getByRole("button", { name: "拒绝" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(fixture.invoke).toHaveBeenCalledWith("resolveApproval", {
      approvalId: "approval-two",
      decision: "deny",
    });
  });

  it("removes expired/invalidated approvals and unsubscribes on unmount", async () => {
    const fixture = installBridge(snapshot());
    const view = render(<BrowserApprovalDialog />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fixture.emit({ ...snapshot(), pendingApprovals: [] });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    view.unmount();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps keyboard focus inside the two-decision dialog", async () => {
    const user = userEvent.setup();
    installBridge(snapshot());
    render(<BrowserApprovalDialog />);
    const deny = await screen.findByRole("button", { name: "拒绝" });
    const allow = screen.getByRole("button", { name: "仅允许这一次" });
    expect(deny).toHaveFocus();
    await user.tab({ shift: true });
    expect(allow).toHaveFocus();
    await user.tab();
    expect(deny).toHaveFocus();
  });

  it("shows only main-derived opaque target aliases and distinguishes successive targets", async () => {
    const firstAlias: `target-${string}` = `target-${"a".repeat(24)}`;
    const secondAlias: `target-${string}` = `target-${"b".repeat(24)}`;
    const fixture = installBridge(snapshot("approval-ref-one", firstAlias));
    render(<BrowserApprovalDialog />);
    expect(await screen.findByText(`目标标识：${firstAlias}`)).toBeInTheDocument();
    act(() => fixture.emit(snapshot("approval-ref-two", secondAlias)));
    expect(await screen.findByText(`目标标识：${secondAlias}`)).toBeInTheDocument();
    expect(screen.queryByText(`目标标识：${firstAlias}`)).not.toBeInTheDocument();
    expect(screen.queryByText(/bank-transfer-confirm|hunter2/u)).not.toBeInTheDocument();
  });

  it("rejects caller-controlled target text from an untrusted chrome snapshot", async () => {
    installBridge(hostileSnapshot("bank-transfer-confirm"));
    render(<BrowserApprovalDialog />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText(/bank-transfer-confirm/u)).not.toBeInTheDocument();
  });

  it("disables decisions in flight and resolves an approval only once", async () => {
    let finish: (() => void) | null = null;
    const fixture = installBridge(
      snapshot(),
      undefined,
      () => new Promise((resolve) => { finish = () => resolve(true); }),
    );
    render(<BrowserApprovalDialog />);
    const allow = await screen.findByRole("button", { name: "仅允许这一次" });
    const deny = screen.getByRole("button", { name: "拒绝" });
    fireEvent.click(allow);
    fireEvent.click(allow);
    fireEvent.click(deny);

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("dialog")).toHaveClass("browser-approval-dialog--busy");
    expect(allow).toBeDisabled();
    expect(deny).toBeDisabled();
    expect(fixture.invoke.mock.calls.filter((call) => call[0] === "resolveApproval"))
      .toHaveLength(1);
    await act(async () => finish?.());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows standing and attach decisions when main allows them", async () => {
    const user = userEvent.setup();
    const fixture = installBridge({
      ...snapshot(),
      pendingApprovals: [{
        ...snapshot().pendingApprovals![0]!,
        allowedDecisions: ["allow_once", "allow_standing", "deny"],
      }],
    });
    render(<BrowserApprovalDialog />);
    expect(await screen.findByRole("button", { name: "记住此网站的这项操作" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "记住此网站的这项操作" }));
    expect(fixture.invoke).toHaveBeenCalledWith("resolveApproval", {
      approvalId: "approval-one",
      decision: "allow_standing",
    });
  });

  it("labels attach and eval operations clearly", async () => {
    installBridge({
      ...snapshot("approval-attach"),
      pendingApprovals: [{
        ...snapshot("approval-attach").pendingApprovals![0]!,
        operation: "attach",
        action: "close",
      }],
    });
    render(<BrowserApprovalDialog />);
    expect(await screen.findByText("附着到标签页")).toBeInTheDocument();
  });

  it("does not let a stale initial snapshot resurrect an invalidated approval", async () => {
    let resolveInitial: ((value: BrowserChromeSnapshot) => void) | null = null;
    const initial = snapshot("approval-stale");
    const fixture = installBridge(initial, () => new Promise((resolve) => {
      resolveInitial = resolve;
    }));
    render(<BrowserApprovalDialog />);
    act(() => fixture.emit({ ...initial, pendingApprovals: [] }));
    await act(async () => resolveInitial?.(initial));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes an approval when its descriptor expires without another snapshot", async () => {
    const base = snapshot("approval-expiring");
    const expiring: BrowserChromeSnapshot = {
      ...base,
      pendingApprovals: [{ ...base.pendingApprovals![0]!, expiresAt: Date.now() + 250 }],
    };
    installBridge(expiring);
    render(<BrowserApprovalDialog />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

const DEFAULT_TARGET_ALIAS: `target-${string}` = `target-${"a".repeat(24)}`;

function snapshot(
  approvalId = "approval-one",
  targetRef: `target-${string}` = DEFAULT_TARGET_ALIAS,
): BrowserChromeSnapshot {
  return {
    currentWindowId: "browser-window-1",
    pendingApprovals: [{
      action: "act",
      approvalId,
      expiresAt: Date.now() + 30_000,
      operation: "type",
      origin: "https://example.com",
      tabId: "browser-tab-1",
      target: { kind: "ref", ref: targetRef },
      windowId: "browser-window-1",
    }],
    windows: [],
  };
}

function hostileSnapshot(targetRef: string): unknown {
  const base = snapshot("approval-hostile");
  return {
    ...base,
    pendingApprovals: [{
      ...base.pendingApprovals![0]!,
      target: { kind: "ref", ref: targetRef },
    }],
  };
}

function installBridge(
  initial: unknown,
  getInitial: () => Promise<unknown> = () => Promise.resolve(initial),
  resolveApproval: () => Promise<unknown> = () => Promise.resolve(true),
) {
  let listener: ((value: BrowserChromeSnapshot) => void) | null = null;
  const invoke = vi.fn((command: string) =>
    command === "getSnapshot" ? getInitial() : resolveApproval());
  const unsubscribe = vi.fn((next: (value: BrowserChromeSnapshot) => void) => {
    if (listener === next) listener = null;
    return true;
  });
  window.aurisBrowser = {
    invoke,
    subscribe(next) {
      listener = next;
      return true;
    },
    unsubscribe,
  } satisfies BrowserNativeBridge;
  return { emit: (value: BrowserChromeSnapshot) => listener?.(value), invoke, unsubscribe };
}
