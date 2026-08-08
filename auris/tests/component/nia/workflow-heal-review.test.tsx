import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowHealReview } from "@/components/nia/workflow-heal-review";
import { WorkflowRecorderPanel } from "@/components/nia/workflow-recorder-panel";

describe("workflow review controls", () => {
  it("starts/stops recording and requires an explicit repair decision", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const recorder = render(<WorkflowRecorderPanel onStart={onStart} onStop={onStop} subscribe={subscribe} />);
    await user.click(screen.getByRole("button", { name: "Start · 开始录制" }));
    expect(onStart).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Stop · 停止录制" }));
    expect(onStop).toHaveBeenCalledOnce();
    recorder.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();

    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<WorkflowHealReview
      proposal={{
        proposalId: "heal-1",
        stepIndex: 1,
        oldTarget: { kind: "selector", selector: "#old" },
        candidates: [
          { target: { kind: "selector", selector: "#one" }, confidence: 0.8 },
          { target: { kind: "selector", selector: "#two" }, confidence: 0.7 },
        ],
        status: "pending",
      }}
      onAccept={onAccept}
      onReject={onReject}
    />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Proposed target" }), "1");
    await user.click(screen.getByRole("button", { name: "Accept and reauthorize" }));
    expect(onAccept).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Reject repair" }));
    expect(onReject).toHaveBeenCalledOnce();
  });
});
