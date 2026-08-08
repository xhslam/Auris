/**
 * Thin compiler adapter over the packaged browser Markdown workflow contract.
 * Compilation produces typed intents and approval points; it grants no authority.
 */
import browserWorkflowContract from "../../../electron/shared/browser-workflow-contract.cjs";
import type {
  BrowserWorkflowAst,
  CompiledBrowserWorkflow,
} from "../../../electron/shared/browser-workflow-contract.cjs";

export type { CompiledBrowserWorkflow };

export const compileBrowserWorkflow = browserWorkflowContract.compileBrowserWorkflow as (
  ast: BrowserWorkflowAst,
) => CompiledBrowserWorkflow;
export const compileBrowserWorkflowFromSource =
  browserWorkflowContract.compileBrowserWorkflowFromSource;
