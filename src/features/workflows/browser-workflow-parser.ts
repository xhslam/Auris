/**
 * Thin parser adapter over the packaged browser Markdown workflow contract.
 */
import browserWorkflowContract from "../../../electron/shared/browser-workflow-contract.cjs";
import type { BrowserWorkflowAst } from "../../../electron/shared/browser-workflow-contract.cjs";

export type { BrowserWorkflowAst };

export const assertRawBrowserWorkflowSource =
  browserWorkflowContract.assertRawBrowserWorkflowSource;
export const parseBrowserWorkflowMarkdown = browserWorkflowContract.parseBrowserWorkflowMarkdown;
export const reparseTrustedBrowserWorkflowSource =
  browserWorkflowContract.reparseTrustedBrowserWorkflowSource;
