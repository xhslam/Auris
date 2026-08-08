/**
 * Thin step-policy adapter over the packaged browser Markdown workflow contract.
 */
import browserWorkflowContract from "../../../electron/shared/browser-workflow-contract.cjs";

export const stepWrites = browserWorkflowContract.stepWrites;
export const stepRetryable = browserWorkflowContract.stepRetryable;
export const requiresPrecedingConfirm = browserWorkflowContract.requiresPrecedingConfirm;
