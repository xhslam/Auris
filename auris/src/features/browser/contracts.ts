import browserContract from "../../../electron/shared/browser-contract.cjs";
import type {
  BrowserActionRequest,
  BrowserAuthorityOperation,
  BrowserCommandContext,
  BrowserCommandEnvelope,
  BrowserId,
  BrowserLeaseToken,
  BrowserOwner,
  BrowserPayloadHash,
  BrowserTargetDescriptor,
  BrowserToolAction,
} from "../../../electron/shared/browser-contract.cjs";

export type {
  BrowserActionRequest,
  BrowserAuthorityOperation,
  BrowserCommandContext,
  BrowserCommandEnvelope,
  BrowserId,
  BrowserLeaseToken,
  BrowserOwner,
  BrowserPayloadHash,
  BrowserTargetDescriptor,
  BrowserToolAction,
};

export const BROWSER_TOOL_ACTIONS = browserContract.BROWSER_TOOL_ACTIONS;
export const BROWSER_AUTHORITY_OPERATIONS = browserContract.BROWSER_AUTHORITY_OPERATIONS;
export const parseBrowserToolAction = browserContract.parseBrowserToolAction;
export const parseBrowserAuthorityOperation = browserContract.parseBrowserAuthorityOperation;
export const deriveBrowserAuthorityOperation = browserContract.deriveBrowserAuthorityOperation;
export const createBrowserCommandEnvelope = browserContract.createBrowserCommandEnvelope;
export const parseBrowserCommandEnvelope = browserContract.parseBrowserCommandEnvelope;
