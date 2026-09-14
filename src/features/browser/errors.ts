import browserContract from "../../../electron/shared/browser-contract.cjs";
import type {
  BrowserErrorMetadata,
  BrowserPublicError,
  BrowserPublicErrorCode,
  SerializedBrowserError,
} from "../../../electron/shared/browser-contract.cjs";

export type {
  BrowserErrorMetadata,
  BrowserPublicError,
  BrowserPublicErrorCode,
  SerializedBrowserError,
};

export const BROWSER_PUBLIC_ERROR_CODES = browserContract.BROWSER_PUBLIC_ERROR_CODES;
export const BROWSER_ERROR_MESSAGES_ZH = browserContract.BROWSER_ERROR_MESSAGES_ZH;
export const createBrowserPublicError = browserContract.createBrowserPublicError;
export const serializeBrowserError = browserContract.serializeBrowserError;
