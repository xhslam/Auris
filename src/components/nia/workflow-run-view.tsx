import type { WorkflowEvent } from "@/features/workflows/workflow-bridge";

export type WorkflowRunPending = Readonly<{
  kind?: string;
  stepIndex?: number;
  message?: string;
  approvalId?: string;
  proposal?: Readonly<{ text?: string; kind?: string }> | string | null;
}>;

export type WorkflowRunState = Readonly<{
  runId: string;
  family: "nia_yaml" | "browser_markdown";
  status: string;
  currentStep?: number | string | null;
  currentStepId?: string | null;
  pending?: WorkflowRunPending | null;
  error?: Readonly<{ code?: string; message?: string }> | null;
  outputs?: unknown;
}>;

function proposalText(pending: WorkflowRunPending | null | undefined): string | null {
  if (!pending?.proposal) return null;
  if (typeof pending.proposal === "string") return pending.proposal;
  if (typeof pending.proposal.text === "string") return pending.proposal.text;
  return null;
}

export function WorkflowRunView({
  state,
  events,
  onCancel,
  onResume,
}: {
  state: WorkflowRunState;
  events: readonly WorkflowEvent[];
  onCancel: () => void;
  onResume?: (input: { approved: boolean; approvalId?: string }) => void;
}) {
  const paused = state.status === "awaiting_confirmation" || state.status === "awaiting_approval";
  const canResume = state.family === "browser_markdown" && paused && typeof onResume === "function";
  const reviewText = state.pending?.message || proposalText(state.pending);
  const approvalId =
    state.pending?.kind === "browser_approval" && typeof state.pending.approvalId === "string"
      ? state.pending.approvalId
      : undefined;

  return (
    <section aria-label="Workflow run" className="nia-workflow-run">
      <header><strong>{state.family}</strong><span>{state.status}</span></header>
      <p>Run: {state.runId}</p>
      <p>Current step: {String(state.currentStep ?? state.currentStepId ?? "—")}</p>
      {state.pending ? <p>Review: {state.pending.kind ?? "approval"}</p> : null}
      {reviewText ? <p className="nia-workflow-run__review">{reviewText}</p> : null}
      {state.error ? <p role="alert">{state.error.code}: {state.error.message}</p> : null}
      {events.length > 0 ? <ol>{events.map((event, index) => <li key={`${event.type}-${index}`}>{event.type}</li>)}</ol> : null}
      <div className="nia-workflow-run__actions">
        {canResume ? (
          <>
            <button
              onClick={() => onResume?.({
                approved: true,
                ...(approvalId ? { approvalId } : {}),
              })}
              type="button"
            >
              Confirm · 确认继续
            </button>
            <button onClick={() => onResume?.({ approved: false })} type="button">
              Deny · 拒绝
            </button>
          </>
        ) : null}
        <button
          disabled={["completed", "failed", "cancelled"].includes(state.status)}
          onClick={onCancel}
          type="button"
        >
          Cancel workflow
        </button>
      </div>
    </section>
  );
}
