import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowLibrary } from "@/components/nia/workflow-library";
import { WorkflowRunView } from "@/components/nia/workflow-run-view";

describe("workflow run UI", () => {
  it("shows family, current step, approvals, evidence events, and cancellation", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onResume = vi.fn();
    render(<WorkflowRunView
      events={[{ family: "browser_markdown", runId: "run-1", type: "approval_required", stepIndex: 2 }]}
      onCancel={onCancel}
      onResume={onResume}
      state={{
        runId: "run-1",
        family: "browser_markdown",
        status: "awaiting_approval",
        currentStep: 2,
        pending: { kind: "browser_approval", stepIndex: 2, approvalId: "approval-9" },
      }}
    />);
    expect(screen.getByText("browser_markdown")).toBeInTheDocument();
    expect(screen.getByText("Review: browser_approval")).toBeInTheDocument();
    expect(screen.getByText("approval_required")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm · 确认继续" }));
    expect(onResume).toHaveBeenCalledWith({ approved: true, approvalId: "approval-9" });
    await user.click(screen.getByRole("button", { name: "Deny · 拒绝" }));
    expect(onResume).toHaveBeenCalledWith({ approved: false });
    await user.click(screen.getByRole("button", { name: "Cancel workflow" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows nia_review proposal text for goal pauses", () => {
    render(<WorkflowRunView
      events={[]}
      onCancel={() => undefined}
      onResume={() => undefined}
      state={{
        runId: "run-2",
        family: "browser_markdown",
        status: "awaiting_confirmation",
        currentStep: 3,
        pending: {
          kind: "nia_review",
          stepIndex: 3,
          proposal: { kind: "nia_compile_proposal", text: "Click the Search button" },
        },
      }}
    />);
    expect(screen.getByText("Review: nia_review")).toBeInTheDocument();
    expect(screen.getByText("Click the Search button")).toBeInTheDocument();
  });

  it("drives list/start/state/events/cancel only through the narrow workflow bridge", async () => {
    const user = userEvent.setup();
    let listener: ((event: Record<string, unknown>) => void) | null = null;
    const invoke = vi.fn(async (command: string) => {
      if (command === "list") return { definitions: [], capabilities: {} };
      if (command === "start") return { runId: "run-1", family: "nia_yaml", status: "running" };
      if (command === "get_state") return { runId: "run-1", family: "nia_yaml", status: "completed" };
      if (command === "cancel") return { runId: "run-1", family: "nia_yaml", status: "cancelled" };
      return { ok: true };
    });
    const unsubscribe = vi.fn(() => true);
    const view = render(<WorkflowLibrary host={{ aurisWorkflows: {
      invoke,
      subscribe: (next: (event: Record<string, unknown>) => void) => { listener = next; return true; },
      unsubscribe,
    } }} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list", {}));
    await user.type(screen.getByLabelText("Workflow source"), "name: demo");
    await user.click(screen.getByRole("button", { name: "Start · 开始" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("start", expect.objectContaining({ family: "nia_yaml" })));
    act(() => { listener?.({ family: "nia_yaml", runId: "run-1", type: "completed" }); });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_state", { family: "nia_yaml", runId: "run-1" }));
    await waitFor(() => expect(screen.getAllByText("completed").length).toBeGreaterThan(0));
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
