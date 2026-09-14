/**
 * Thin typed adapter over the packaged Nia YAML workflow event vocabulary.
 */
import niaWorkflowContract from "../../../electron/shared/nia-workflow-contract.cjs";
import type {
  NiaWorkflowEvent,
  NiaWorkflowEventType,
  NiaWorkflowStepStatus,
} from "../../../electron/shared/nia-workflow-contract.cjs";

export type { NiaWorkflowEvent, NiaWorkflowEventType, NiaWorkflowStepStatus };

export const NIA_WORKFLOW_EVENT_TYPES = niaWorkflowContract.NIA_WORKFLOW_EVENT_TYPES;
export const NIA_WORKFLOW_STEP_STATUSES = niaWorkflowContract.NIA_WORKFLOW_STEP_STATUSES;

export function isNiaWorkflowEventType(value: unknown): value is NiaWorkflowEventType {
  return (
    typeof value === "string" &&
    (NIA_WORKFLOW_EVENT_TYPES as readonly string[]).includes(value)
  );
}
