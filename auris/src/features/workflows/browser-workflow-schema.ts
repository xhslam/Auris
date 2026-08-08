/**
 * Thin typed adapter over the packaged browser Markdown workflow contract.
 * All schema/constants live in `electron/shared/browser-workflow-contract.cjs`.
 */
import browserWorkflowContract from "../../../electron/shared/browser-workflow-contract.cjs";
import type {
  BrowserWorkflowAst,
  BrowserWorkflowErrorCode,
  BrowserWorkflowStep,
  BrowserWorkflowStepKind,
  CompiledBrowserWorkflow,
} from "../../../electron/shared/browser-workflow-contract.cjs";

export type {
  BrowserWorkflowAst,
  BrowserWorkflowErrorCode,
  BrowserWorkflowStep,
  BrowserWorkflowStepKind,
  CompiledBrowserWorkflow,
};

export const BROWSER_WORKFLOW_FAMILY = browserWorkflowContract.BROWSER_WORKFLOW_FAMILY;
export const BROWSER_WORKFLOW_STEP_KINDS = browserWorkflowContract.BROWSER_WORKFLOW_STEP_KINDS;
export const BROWSER_WORKFLOW_INPUT_TYPES = browserWorkflowContract.BROWSER_WORKFLOW_INPUT_TYPES;
export const BROWSER_WORKFLOW_TRIGGERS = browserWorkflowContract.BROWSER_WORKFLOW_TRIGGERS;
export const BROWSER_WORKFLOW_ERROR_CODES = browserWorkflowContract.BROWSER_WORKFLOW_ERROR_CODES;
export const BROWSER_WORKFLOW_LIMITS = browserWorkflowContract.BROWSER_WORKFLOW_LIMITS;
export const browserWorkflowAstSchema = browserWorkflowContract.browserWorkflowAstSchema;
export const BrowserWorkflowError = browserWorkflowContract.BrowserWorkflowError;
