/**
 * Shared Nia provider configuration contracts for UI and IPC payloads.
 *
 * Runtime persistence and secret lifecycle live in
 * `electron/nia/nia-provider-store.cjs`. These constants/types are the
 * renderer-safe vocabulary that must stay aligned with that store.
 */

export const NIA_REST_PROTOCOLS = [
  "anthropic",
  "openai",
  "openai-compatible",
  "google-ai",
  "ollama",
] as const;

export type NiaRestProtocol = (typeof NIA_REST_PROTOCOLS)[number];

/** Fixed audited CLI adapter IDs. Task 4 implements the adapters themselves. */
export const NIA_CLI_ADAPTER_IDS = ["claude", "codex", "gemini"] as const;

export type NiaCliAdapterId = (typeof NIA_CLI_ADAPTER_IDS)[number];

export const NIA_PROVIDER_CAPABILITY_KEYS = [
  "streaming",
  "toolModeDisable",
  "cancellation",
  "attachments",
  "maxInputTokens",
  "maxOutputTokens",
  "independentToolAuthority",
  "riskAccepted",
] as const;

export type NiaProviderCapabilityKey = (typeof NIA_PROVIDER_CAPABILITY_KEYS)[number];

export const NIA_PROVIDER_LIMITS = Object.freeze({
  id: 64,
  label: 128,
  model: 160,
  endpoint: 2048,
  maxSupportedModels: 64,
  timeoutMs: Object.freeze({ default: 60_000, min: 1_000, max: 300_000 }),
  maxOutputBytes: Object.freeze({ default: 1_048_576, min: 1_024, max: 8_388_608 }),
  maxInputTokens: Object.freeze({ default: 128_000, min: 1, max: 2_000_000 }),
  maxOutputTokens: Object.freeze({ default: 8_192, min: 1, max: 200_000 }),
});

export const NIA_PROVIDER_SECRET_NAMESPACE = "nia-provider" as const;

export interface NiaProviderCapabilities {
  readonly streaming: boolean;
  readonly toolModeDisable: boolean;
  readonly cancellation: boolean;
  readonly attachments: boolean;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly independentToolAuthority?: boolean;
  readonly riskAccepted?: boolean;
}

export interface NiaProviderBounds {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface NiaKeychainSecretRef {
  readonly kind: "keychain-ref";
  readonly namespace: typeof NIA_PROVIDER_SECRET_NAMESPACE;
  readonly account: string;
}

export interface NiaRestProviderConfig {
  readonly id: string;
  readonly kind: "rest";
  readonly protocol: NiaRestProtocol;
  readonly label: string;
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];
  readonly capabilities: NiaProviderCapabilities;
  readonly bounds: NiaProviderBounds;
  readonly rememberOnThisMac: boolean;
  readonly secretRef: NiaKeychainSecretRef | null;
}

export interface NiaCliProviderConfig {
  readonly id: string;
  readonly kind: "cli";
  readonly adapterId: NiaCliAdapterId;
  readonly label: string;
  readonly enabled: boolean;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];
  readonly capabilities: NiaProviderCapabilities;
  readonly bounds: NiaProviderBounds;
}

export type NiaProviderConfig = NiaRestProviderConfig | NiaCliProviderConfig;

export interface NiaProviderConfigSnapshot {
  readonly activeProviderId: string | null;
  readonly providers: readonly NiaProviderConfig[];
}

export type NiaProviderSchemaErrorCode =
  | "INVALID_PROVIDER_SHAPE"
  | "PLAINTEXT_SECRET_REJECTED"
  | "URL_CREDENTIAL_REJECTED"
  | "NON_HTTPS_ENDPOINT_REJECTED"
  | "UNKNOWN_CAPABILITY"
  | "UNKNOWN_CLI_ADAPTER"
  | "USER_EXECUTABLE_REJECTED"
  | "USER_RAW_FLAGS_REJECTED"
  | "USER_SHELL_REJECTED"
  | "USER_ENV_REJECTED"
  | "USER_CWD_REJECTED"
  | "UNBOUNDED_LIMIT_REJECTED"
  | "RISK_ACCEPTANCE_REQUIRED"
  | "MODEL_NOT_SUPPORTED";
