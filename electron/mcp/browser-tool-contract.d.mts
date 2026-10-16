import type { z } from "zod";
import type canonical from "../shared/browser-contract.cjs";

export const BROWSER_CONTRACT_LIMITS: typeof canonical.BROWSER_CONTRACT_LIMITS;
export const BROWSER_TOOL_ACTIONS: typeof canonical.BROWSER_TOOL_ACTIONS;
export const browserActionRequestSchema: typeof canonical.browserActionRequestSchema;
export const browserCommandEnvelopeSchema: typeof canonical.browserCommandEnvelopeSchema;
export const browserToolActionSchema: typeof canonical.browserToolActionSchema;
export const createBrowserPublicError: typeof canonical.createBrowserPublicError;
export const createBrowserCommandEnvelope: typeof canonical.createBrowserCommandEnvelope;
export const serializeBrowserError: typeof canonical.serializeBrowserError;

type Action = canonical.BrowserActionRequest["action"];
export const BROWSER_DEFAULT_ACTION_TIMEOUT_MS: 12000;
export const BROWSER_TRANSPORT_MARGIN_MS: 1000;
export const BROWSER_READ_ACTIONS: readonly Action[];
export const BROWSER_MUTATION_ACTIONS: readonly Action[];
export const BROWSER_ACTION_TIMEOUT_MS: Readonly<Record<Action, number>>;
export const BROWSER_TOOL_DESCRIPTION: string;
export const BROWSER_READ_TOOL_DESCRIPTION: string;

type Target = Readonly<{ windowId: string; tabId: string }>;
type Control = Target & Readonly<{
  navigationGeneration: number;
  controlEpoch: number;
  leaseToken: string;
}>;
type FlatInput<Request = canonical.BrowserActionRequest> =
  Request extends { action: "get_state" | "open" } ? Request
    : Request extends { action: "acquire_control" } ? Request | (Request & Target)
      : Request & Control & { approvalId?: string };
export type BrowserToolInput = FlatInput;
export type ParsedBrowserToolInput = Readonly<{
  request: canonical.BrowserActionRequest;
  target?: Target;
  control?: Control;
  approvalId?: string;
}>;
export const browserToolInputSchema: z.ZodType<BrowserToolInput>;
export const browserReadToolInputSchema: z.ZodType<BrowserToolInput>;
export const browserMutationToolInputSchema: z.ZodType<BrowserToolInput>;
export const browserToolMcpInputSchema: z.ZodType<BrowserToolInput>;
export const browserReadToolMcpInputSchema: z.ZodType<BrowserToolInput>;
export const browserMutationToolMcpInputSchema: z.ZodType<BrowserToolInput>;
export function parseBrowserToolInput(input: unknown): ParsedBrowserToolInput;
export function parseBrowserReadToolInput(input: unknown): ParsedBrowserToolInput;
export function parseBrowserMutationToolInput(input: unknown): ParsedBrowserToolInput;
export function getBrowserActionTimeoutMs(requestInput: unknown): number;
export function getBrowserTransportTimeoutMs(requestInput: unknown): number;
export function createBrowserToolSuccessResult<T>(result: T): {
  content: Array<{ text: string; type: "text" }>;
  structuredContent: { result: T };
};
export function createBrowserToolErrorResult(error: unknown): {
  content: Array<{ text: string; type: "text" }>;
  isError: true;
  structuredContent: { ok: false; error: canonical.SerializedBrowserError };
};
