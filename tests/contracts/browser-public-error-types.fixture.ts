import browserContract from "../../electron/shared/browser-contract.cjs";
import type {
  BrowserPublicError,
  SerializedBrowserError,
} from "../../electron/shared/browser-contract.cjs";

declare const wireError: SerializedBrowserError;

if (wireError.code === "APPROVAL_REQUIRED") {
  void wireError.metadata?.approvalId;
  void wireError.metadata?.destination;
  const alias: `target-${string}` | undefined = wireError.metadata?.target?.ref;
  void alias;
} else {
  // @ts-expect-error Approval authority fields are unavailable on other public error codes.
  void wireError.metadata?.approvalId;
  // @ts-expect-error Approval destinations are unavailable on other public error codes.
  void wireError.metadata?.destination;
  // @ts-expect-error Approval targets are unavailable on other public error codes.
  void wireError.metadata?.target;
}

const approvalError = browserContract.createBrowserPublicError("APPROVAL_REQUIRED", {
  approvalId: "approval-one",
  target: { kind: "ref", ref: `target-${"a".repeat(24)}` },
});
void approvalError.metadata?.approvalId;
void approvalError.metadata?.target?.ref;

const timeoutError = browserContract.createBrowserPublicError("TIMEOUT", {
  approvalId: "must-be-sanitized-at-runtime",
});
// @ts-expect-error The generic BrowserPublicError keeps approval fields off other codes.
void timeoutError.metadata?.approvalId;

declare const genericError: BrowserPublicError<"APPROVAL_REQUIRED">;
void genericError.metadata?.approvalId;
void genericError.metadata?.target?.ref;
