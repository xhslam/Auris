import type { z } from "zod";

declare namespace browserContract {
  const BROWSER_TOOL_ACTIONS: readonly BrowserToolAction[];
  const BROWSER_AUTHORITY_OPERATIONS: readonly BrowserAuthorityOperation[];
  const BROWSER_PUBLIC_ERROR_CODES: readonly BrowserPublicErrorCode[];
  const BROWSER_ERROR_MESSAGES_ZH: Readonly<Record<BrowserPublicErrorCode, string>>;
  const BROWSER_CONTRACT_LIMITS: Readonly<{
    id: number;
    token: number;
    selector: number;
    text: number;
    key: number;
    url: number;
    script: number;
    css: number;
    sessionName: number;
    metadataValue: number;
    timeoutMs: number;
  }>;
  const browserToolActionSchema: z.ZodType<BrowserToolAction>;
  const browserAuthorityOperationSchema: z.ZodType<BrowserAuthorityOperation>;
  const browserPublicErrorCodeSchema: z.ZodType<BrowserPublicErrorCode>;
  const browserOwnerSchema: z.ZodType<BrowserOwner>;
  const browserTargetDescriptorSchema: z.ZodType<BrowserTargetDescriptor>;
  const browserActionRequestSchema: z.ZodType<BrowserActionRequest>;
  const browserCommandEnvelopeSchema: z.ZodType<BrowserCommandEnvelope>;

  function parseBrowserToolAction(value: unknown): BrowserToolAction;
  function parseBrowserAuthorityOperation(value: unknown): BrowserAuthorityOperation;
  function deriveBrowserAuthorityOperation(value: unknown): BrowserAuthorityOperation;
  function createBrowserCommandEnvelope(
    context: BrowserCommandContext,
    request: BrowserActionRequest,
  ): BrowserCommandEnvelope;
  function parseBrowserCommandEnvelope(value: unknown): BrowserCommandEnvelope;
  function sanitizeBrowserApprovalTarget(value: unknown): BrowserApprovalTarget | undefined;
  function createBrowserPublicError<TCode extends BrowserPublicErrorCode>(
    code: TCode,
    metadata?: Record<string, unknown>,
    cause?: unknown,
  ): BrowserPublicError<TCode>;
  function serializeBrowserError(error: unknown): SerializedBrowserError;

  type Brand<T, TBrand extends string> = T & { readonly __browserBrand: TBrand };

  type BrowserToolAction = Brand<
    | "get_state" | "open" | "acquire_control" | "release_control" | "close" | "focus"
    | "navigate" | "wait" | "wait_for" | "read" | "screenshot" | "query" | "console"
    | "act" | "style" | "execute_js" | "session_save" | "session_load",
    "BrowserToolAction"
  >;
  type BrowserAuthorityOperation = Brand<
    | "read" | "attach" | "click" | "type" | "scroll" | "key" | "style" | "navigate"
    | "publish" | "upload" | "eval" | "session",
    "BrowserAuthorityOperation"
  >;
  type BrowserId = Brand<string, "BrowserId">;
  type BrowserLeaseToken = Brand<string, "BrowserLeaseToken">;
  type BrowserPayloadHash = Brand<string, "BrowserPayloadHash">;

  type BrowserOwner = {
    kind: "mcp" | "workflow" | "nia";
    id: BrowserId;
  };

  type BrowserTargetDescriptor =
    | { kind: "ref"; ref: string }
    | { kind: "selector"; selector: string };

  type BrowserApprovalTargetAlias = `target-${string}`;
  type BrowserApprovalTarget = Readonly<{
    kind: "ref";
    ref: BrowserApprovalTargetAlias;
  }>;

  type BrowserActionRequest =
    | { action: "get_state" }
    | { action: "open"; url: string }
    | { action: "acquire_control" }
    | { action: "release_control" }
    | { action: "close" }
    | { action: "focus" }
    | { action: "navigate"; url: string }
    | { action: "wait"; milliseconds: number }
    | { action: "wait_for"; target: BrowserTargetDescriptor; timeoutMs?: number }
    | { action: "read"; target?: BrowserTargetDescriptor }
    | { action: "screenshot"; target?: BrowserTargetDescriptor; publication?: "evidence" }
    | { action: "query"; target: BrowserTargetDescriptor }
    | { action: "console"; level?: "all" | "debug" | "info" | "warning" | "error" }
    | { action: "act"; variant: "click"; target: BrowserTargetDescriptor }
    | { action: "act"; variant: "type"; target: BrowserTargetDescriptor; text: string }
    | { action: "act"; variant: "scroll"; deltaX?: number; deltaY?: number }
    | { action: "act"; variant: "key"; key: string }
    | { action: "style"; target: BrowserTargetDescriptor; css: string }
    | { action: "execute_js"; source: string }
    | { action: "session_save"; name: string }
    | { action: "session_load"; name: string };

  type BrowserCommandContext = {
    windowId: string;
    tabId: string;
    navigationGeneration: number;
    controlEpoch: number;
    owner: { kind: "mcp" | "workflow" | "nia"; id: string };
    leaseToken: string;
    payloadHash?: string;
  };

  type BrowserCommandEnvelope = {
    windowId: BrowserId;
    tabId: BrowserId;
    navigationGeneration: number;
    controlEpoch: number;
    owner: BrowserOwner;
    leaseToken: BrowserLeaseToken;
    action: BrowserToolAction;
    authorityOperation: BrowserAuthorityOperation;
    target?: BrowserTargetDescriptor;
    payloadHash?: BrowserPayloadHash;
  };

  type BrowserPublicErrorCode =
    | "BROWSER_DISABLED" | "WINDOW_NOT_FOUND" | "TAB_NOT_FOUND" | "AMBIGUOUS_TARGET"
    | "STALE_NAVIGATION" | "CONTROL_STALE" | "OWNER_MISMATCH" | "NO_COMMITTED_ORIGIN"
    | "ORIGIN_NOT_GRANTED" | "ATTACHMENT_REQUIRED" | "LEASE_LOST" | "POLICY_STALE"
    | "NAVIGATION_BLOCKED" | "OPERATION_NOT_ALLOWED" | "APPROVAL_REQUIRED"
    | "APPROVAL_EXPIRED" | "PAYLOAD_MISMATCH" | "PROFILE_ORIGIN_CONFINED" | "TIMEOUT"
    | "CANCELLED" | "CONNECTION_CLOSED" | "PAGE_CRASHED" | "SESSION_NOT_FOUND"
    | "CAPABILITY_NOT_VERIFIED" | "WORKFLOW_INVALID" | "WORKFLOW_UNTRUSTED"
    | "NIA_PROVIDER_UNAVAILABLE" | "NIA_PROVIDER_RESPONSE_INVALID";

  type BrowserErrorMetadata = Readonly<
    Partial<Record<
      | "action" | "operation" | "windowId" | "tabId" | "origin"
      | "sessionId" | "capability" | "workflowId",
      string
    >> & { retryAfterMs?: number }
  >;

  type BrowserApprovalRequiredMetadata = Readonly<BrowserErrorMetadata & {
    approvalId?: string;
    destination?: string;
    target?: BrowserApprovalTarget;
  }>;

  type BrowserPublicErrorMetadata<TCode extends BrowserPublicErrorCode> =
    TCode extends "APPROVAL_REQUIRED" ? BrowserApprovalRequiredMetadata : BrowserErrorMetadata;

  type SerializedBrowserApprovalRequiredError = Readonly<{
    code: "APPROVAL_REQUIRED";
    message: string;
    metadata?: BrowserApprovalRequiredMetadata;
  }>;

  type SerializedBrowserOtherError = Readonly<{
    code: Exclude<BrowserPublicErrorCode, "APPROVAL_REQUIRED">;
    message: string;
    metadata?: BrowserErrorMetadata;
  }>;

  type SerializedBrowserError =
    | SerializedBrowserApprovalRequiredError
    | SerializedBrowserOtherError;

  type SerializedBrowserErrorFor<TCode extends BrowserPublicErrorCode> =
    TCode extends "APPROVAL_REQUIRED"
      ? SerializedBrowserApprovalRequiredError
      : SerializedBrowserOtherError & { code: TCode };

  class BrowserPublicError<
    TCode extends BrowserPublicErrorCode = BrowserPublicErrorCode,
  > extends Error {
    readonly code: TCode;
    readonly metadata?: BrowserPublicErrorMetadata<TCode>;
    readonly cause?: unknown;
    toJSON(): SerializedBrowserErrorFor<TCode>;
  }
}

export = browserContract;
