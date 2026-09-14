/**
 * Thin Zod validators for Nia provider drafts.
 *
 * Main-process persistence/secret authority remains in
 * `electron/nia/nia-provider-store.cjs`. This module only validates
 * renderer/IPC-shaped drafts before they are sent across the bridge.
 */

import { z } from "zod";

import {
  NIA_CLI_ADAPTER_IDS,
  NIA_PROVIDER_CAPABILITY_KEYS,
  NIA_PROVIDER_LIMITS,
  NIA_REST_PROTOCOLS,
  type NiaCliProviderConfig,
  type NiaProviderCapabilities,
  type NiaProviderSchemaErrorCode,
  type NiaRestProviderConfig,
} from "./provider-contract";

const MODEL_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,158}[A-Za-z0-9])?$/u;
const PROVIDER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;

const FORBIDDEN_SECRET_KEYS = new Set([
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "access_token",
  "password",
  "secret",
  "authorization",
]);

const FORBIDDEN_CLI_KEYS = Object.freeze({
  executablePath: "USER_EXECUTABLE_REJECTED",
  executable: "USER_EXECUTABLE_REJECTED",
  argv: "USER_RAW_FLAGS_REJECTED",
  rawFlags: "USER_RAW_FLAGS_REJECTED",
  flags: "USER_RAW_FLAGS_REJECTED",
  shell: "USER_SHELL_REJECTED",
  shellCommand: "USER_SHELL_REJECTED",
  env: "USER_ENV_REJECTED",
  envNames: "USER_ENV_REJECTED",
  environment: "USER_ENV_REJECTED",
  cwd: "USER_CWD_REJECTED",
  workingDirectory: "USER_CWD_REJECTED",
} as const);

export class NiaProviderSchemaError extends Error {
  readonly code: NiaProviderSchemaErrorCode;

  constructor(code: NiaProviderSchemaErrorCode, message: string) {
    super(message);
    this.name = "NiaProviderSchemaError";
    this.code = code;
  }
}

function schemaError(code: NiaProviderSchemaErrorCode, message: string): NiaProviderSchemaError {
  return new NiaProviderSchemaError(code, message);
}

function assertNoPlaintextSecrets(input: unknown): void {
  if (!input || typeof input !== "object") return;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (FORBIDDEN_SECRET_KEYS.has(key)) {
      throw schemaError(
        "PLAINTEXT_SECRET_REJECTED",
        `Provider drafts must not include plaintext secret field "${key}".`,
      );
    }
  }
}

function assertNoForbiddenCliKeys(input: unknown): void {
  if (!input || typeof input !== "object") return;
  for (const [key, code] of Object.entries(FORBIDDEN_CLI_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw schemaError(code, `CLI provider drafts must not include "${key}".`);
    }
  }
}

function boundedInt(limit: { min: number; max: number; default: number }) {
  return z
    .number()
    .int()
    .min(limit.min)
    .max(limit.max)
    .optional()
    .transform((value) => value ?? limit.default);
}

const capabilitiesObjectSchema = z
  .object({
    streaming: z.boolean(),
    toolModeDisable: z.boolean(),
    cancellation: z.boolean(),
    attachments: z.boolean(),
    maxInputTokens: z
      .number()
      .int()
      .min(NIA_PROVIDER_LIMITS.maxInputTokens.min)
      .max(NIA_PROVIDER_LIMITS.maxInputTokens.max),
    maxOutputTokens: z
      .number()
      .int()
      .min(NIA_PROVIDER_LIMITS.maxOutputTokens.min)
      .max(NIA_PROVIDER_LIMITS.maxOutputTokens.max),
    independentToolAuthority: z.boolean().optional(),
    riskAccepted: z.boolean().optional(),
  })
  .strict();

const boundsObjectSchema = z
  .object({
    timeoutMs: boundedInt(NIA_PROVIDER_LIMITS.timeoutMs),
    maxOutputBytes: boundedInt(NIA_PROVIDER_LIMITS.maxOutputBytes),
  })
  .strict()
  .optional()
  .transform((value) => ({
    timeoutMs: value?.timeoutMs ?? NIA_PROVIDER_LIMITS.timeoutMs.default,
    maxOutputBytes: value?.maxOutputBytes ?? NIA_PROVIDER_LIMITS.maxOutputBytes.default,
  }));

const modelIdSchema = z
  .string()
  .min(1)
  .max(NIA_PROVIDER_LIMITS.model)
  .regex(MODEL_ID_PATTERN);

const providerIdSchema = z
  .string()
  .min(1)
  .max(NIA_PROVIDER_LIMITS.id)
  .regex(PROVIDER_ID_PATTERN);

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function assertSafeRestEndpoint(endpoint: string, protocol: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw schemaError("INVALID_PROVIDER_SHAPE", "REST endpoint must be a valid URL.");
  }

  if (url.username || url.password) {
    throw schemaError(
      "URL_CREDENTIAL_REJECTED",
      "REST endpoints must not embed URL credentials.",
    );
  }

  if (url.protocol === "https:") {
    return url.toString().replace(/\/$/u, "") === endpoint.replace(/\/$/u, "")
      ? endpoint
      : url.toString();
  }

  if (url.protocol === "http:") {
    if (protocol === "ollama" && isLoopbackHost(url.hostname)) {
      return endpoint;
    }
    throw schemaError(
      "NON_HTTPS_ENDPOINT_REJECTED",
      "Remote REST endpoints must use HTTPS (Ollama loopback HTTP is the only exception).",
    );
  }

  throw schemaError(
    "NON_HTTPS_ENDPOINT_REJECTED",
    "REST endpoints must use HTTPS (or Ollama loopback HTTP).",
  );
}

export function validateProviderCapabilities(
  input: unknown,
): NiaProviderCapabilities {
  if (!input || typeof input !== "object") {
    throw schemaError("INVALID_PROVIDER_SHAPE", "Provider capabilities are required.");
  }

  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (!(NIA_PROVIDER_CAPABILITY_KEYS as readonly string[]).includes(key)) {
      throw schemaError("UNKNOWN_CAPABILITY", `Unknown provider capability "${key}".`);
    }
  }

  let parsed: NiaProviderCapabilities;
  try {
    parsed = capabilitiesObjectSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw schemaError("INVALID_PROVIDER_SHAPE", error.issues[0]?.message ?? "Invalid capabilities.");
    }
    throw error;
  }

  if (parsed.independentToolAuthority === true && parsed.riskAccepted !== true) {
    throw schemaError(
      "RISK_ACCEPTANCE_REQUIRED",
      "Providers with unavoidable independent tool authority require explicit risk acceptance.",
    );
  }

  return parsed;
}

const restDraftSchema = z
  .object({
    id: providerIdSchema,
    kind: z.literal("rest"),
    protocol: z.enum(NIA_REST_PROTOCOLS),
    label: z.string().min(1).max(NIA_PROVIDER_LIMITS.label),
    enabled: z.boolean(),
    endpoint: z.string().min(1).max(NIA_PROVIDER_LIMITS.endpoint),
    defaultModel: modelIdSchema,
    supportedModels: z.array(modelIdSchema).min(1).max(NIA_PROVIDER_LIMITS.maxSupportedModels),
    capabilities: z.unknown(),
    bounds: boundsObjectSchema,
    rememberOnThisMac: z.boolean().optional(),
  })
  .strict();

const cliDraftSchema = z
  .object({
    id: providerIdSchema,
    kind: z.literal("cli"),
    adapterId: z.enum(NIA_CLI_ADAPTER_IDS),
    label: z.string().min(1).max(NIA_PROVIDER_LIMITS.label),
    enabled: z.boolean(),
    defaultModel: modelIdSchema,
    supportedModels: z.array(modelIdSchema).min(1).max(NIA_PROVIDER_LIMITS.maxSupportedModels),
    capabilities: z.unknown(),
    bounds: boundsObjectSchema,
  })
  .strict();

export function parseRestProviderDraft(input: unknown): Omit<
  NiaRestProviderConfig,
  "secretRef"
> & { secretRef?: null } {
  assertNoPlaintextSecrets(input);
  assertNoForbiddenCliKeys(input);

  let draft: z.infer<typeof restDraftSchema>;
  try {
    draft = restDraftSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      if (
        issue?.code === "too_big" &&
        (issue.path.includes("timeoutMs") || issue.path.includes("maxOutputBytes"))
      ) {
        throw schemaError("UNBOUNDED_LIMIT_REJECTED", issue.message);
      }
      if (
        issue?.code === "invalid_type" &&
        (issue.path.includes("timeoutMs") || issue.path.includes("maxOutputBytes"))
      ) {
        throw schemaError("UNBOUNDED_LIMIT_REJECTED", issue.message);
      }
      throw schemaError("INVALID_PROVIDER_SHAPE", issue?.message ?? "Invalid REST provider.");
    }
    throw error;
  }

  if (
    input &&
    typeof input === "object" &&
    "bounds" in input &&
    (input as { bounds?: { timeoutMs?: unknown; maxOutputBytes?: unknown } }).bounds
  ) {
    const bounds = (input as { bounds: { timeoutMs?: unknown; maxOutputBytes?: unknown } }).bounds;
    for (const value of [bounds.timeoutMs, bounds.maxOutputBytes]) {
      if (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY) {
        throw schemaError("UNBOUNDED_LIMIT_REJECTED", "Provider bounds must be finite.");
      }
    }
  }

  const endpoint = assertSafeRestEndpoint(draft.endpoint, draft.protocol);
  const capabilities = validateProviderCapabilities(draft.capabilities);

  if (!draft.supportedModels.includes(draft.defaultModel)) {
    throw schemaError(
      "MODEL_NOT_SUPPORTED",
      "defaultModel must be present in supportedModels.",
    );
  }

  return {
    id: draft.id,
    kind: "rest",
    protocol: draft.protocol,
    label: draft.label,
    enabled: draft.enabled,
    endpoint,
    defaultModel: draft.defaultModel,
    supportedModels: draft.supportedModels,
    capabilities,
    bounds: draft.bounds,
    rememberOnThisMac: draft.rememberOnThisMac ?? false,
    secretRef: null,
  };
}

export function parseCliProviderDraft(input: unknown): NiaCliProviderConfig {
  assertNoPlaintextSecrets(input);
  assertNoForbiddenCliKeys(input);

  if (
    input &&
    typeof input === "object" &&
    "adapterId" in input &&
    typeof (input as { adapterId: unknown }).adapterId === "string" &&
    !(NIA_CLI_ADAPTER_IDS as readonly string[]).includes(
      (input as { adapterId: string }).adapterId,
    )
  ) {
    throw schemaError(
      "UNKNOWN_CLI_ADAPTER",
      `CLI adapterId must be one of: ${NIA_CLI_ADAPTER_IDS.join(", ")}.`,
    );
  }

  let draft: z.infer<typeof cliDraftSchema>;
  try {
    draft = cliDraftSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      if (
        issue?.code === "too_big" &&
        (issue.path.includes("timeoutMs") || issue.path.includes("maxOutputBytes"))
      ) {
        throw schemaError("UNBOUNDED_LIMIT_REJECTED", issue.message);
      }
      throw schemaError("INVALID_PROVIDER_SHAPE", issue?.message ?? "Invalid CLI provider.");
    }
    throw error;
  }

  if (
    input &&
    typeof input === "object" &&
    "bounds" in input &&
    (input as { bounds?: { timeoutMs?: unknown; maxOutputBytes?: unknown } }).bounds
  ) {
    const bounds = (input as { bounds: { timeoutMs?: unknown; maxOutputBytes?: unknown } }).bounds;
    for (const value of [bounds.timeoutMs, bounds.maxOutputBytes]) {
      if (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY) {
        throw schemaError("UNBOUNDED_LIMIT_REJECTED", "Provider bounds must be finite.");
      }
    }
  }

  const capabilities = validateProviderCapabilities(draft.capabilities);

  if (!draft.supportedModels.includes(draft.defaultModel)) {
    throw schemaError(
      "MODEL_NOT_SUPPORTED",
      "defaultModel must be present in supportedModels.",
    );
  }

  return {
    id: draft.id,
    kind: "cli",
    adapterId: draft.adapterId,
    label: draft.label,
    enabled: draft.enabled,
    defaultModel: draft.defaultModel,
    supportedModels: draft.supportedModels,
    capabilities,
    bounds: draft.bounds,
  };
}

export function resolveDefinitionModelOverride(
  provider: { defaultModel: string; supportedModels: readonly string[] },
  modelOverride: string | undefined,
): { model: string; overridden: boolean } {
  if (modelOverride == null || modelOverride === "") {
    return { model: provider.defaultModel, overridden: false };
  }
  if (!provider.supportedModels.includes(modelOverride)) {
    throw schemaError(
      "MODEL_NOT_SUPPORTED",
      `Model "${modelOverride}" is not reported as supported by the selected provider.`,
    );
  }
  return { model: modelOverride, overridden: true };
}
