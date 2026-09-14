"use strict";

/**
 * Nia provider configuration store (main-process authority).
 *
 * Persists provider metadata separately from secrets. REST API keys stay in a
 * non-serializable in-memory map by default; only an explicit
 * `rememberOnThisMac(true)` writes an opaque Keychain reference via the
 * namespaced Keychain adapter. `rememberOnThisMac` is never inferred from a
 * previously found vault entry.
 */

const fsp = require("node:fs/promises");
const path = require("node:path");

const {
  NIA_PROVIDER_SECRET_NAMESPACE,
} = require("../security/keychain-secret-store.cjs");

const NIA_REST_PROTOCOLS = Object.freeze([
  "anthropic",
  "openai",
  "openai-compatible",
  "google-ai",
  "ollama",
]);

const NIA_CLI_ADAPTER_IDS = Object.freeze(["claude", "codex", "gemini"]);

const NIA_PROVIDER_CAPABILITY_KEYS = Object.freeze([
  "streaming",
  "toolModeDisable",
  "cancellation",
  "attachments",
  "maxInputTokens",
  "maxOutputTokens",
  "independentToolAuthority",
  "riskAccepted",
]);

const NIA_PROVIDER_LIMITS = Object.freeze({
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

const NIA_PROVIDER_STORE_ERROR_CODES = Object.freeze([
  "INVALID_BASE_DIR",
  "INVALID_SECRET_STORE",
  "INVALID_PROVIDER_SHAPE",
  "PLAINTEXT_SECRET_REJECTED",
  "URL_CREDENTIAL_REJECTED",
  "NON_HTTPS_ENDPOINT_REJECTED",
  "UNKNOWN_CAPABILITY",
  "UNKNOWN_CLI_ADAPTER",
  "USER_EXECUTABLE_REJECTED",
  "USER_RAW_FLAGS_REJECTED",
  "USER_SHELL_REJECTED",
  "USER_ENV_REJECTED",
  "USER_CWD_REJECTED",
  "UNBOUNDED_LIMIT_REJECTED",
  "RISK_ACCEPTANCE_REQUIRED",
  "MODEL_NOT_SUPPORTED",
  "PROVIDER_NOT_FOUND",
  "PROVIDER_DISABLED",
  "SESSION_KEY_REQUIRED",
  "REMEMBER_NOT_SUPPORTED",
]);

const CONFIG_FILE_NAME = "providers.json";
const MODEL_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,158}[A-Za-z0-9])?$/u;
const PROVIDER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;

const FORBIDDEN_SECRET_KEYS = Object.freeze([
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
});

class NiaProviderStoreError extends Error {
  constructor(code, message, details) {
    if (!NIA_PROVIDER_STORE_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia provider store error code: ${code}`);
    }
    super(message);
    this.name = "NiaProviderStoreError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function storeError(code, message, details) {
  return new NiaProviderStoreError(code, message, details);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertNoPlaintextSecrets(input) {
  if (!input || typeof input !== "object") return;
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_SECRET_KEYS.includes(key)) {
      throw storeError(
        "PLAINTEXT_SECRET_REJECTED",
        `Provider configs must not include plaintext secret field "${key}".`,
      );
    }
  }
}

function assertNoForbiddenCliKeys(input) {
  if (!input || typeof input !== "object") return;
  for (const [key, code] of Object.entries(FORBIDDEN_CLI_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw storeError(code, `CLI provider configs must not include "${key}".`);
    }
  }
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function assertSafeRestEndpoint(endpoint, protocol) {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > NIA_PROVIDER_LIMITS.endpoint) {
    throw storeError("INVALID_PROVIDER_SHAPE", "REST endpoint must be a non-empty bounded URL.");
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw storeError("INVALID_PROVIDER_SHAPE", "REST endpoint must be a valid URL.");
  }
  if (url.username || url.password) {
    throw storeError("URL_CREDENTIAL_REJECTED", "REST endpoints must not embed URL credentials.");
  }
  if (url.protocol === "https:") return endpoint;
  if (url.protocol === "http:" && protocol === "ollama" && isLoopbackHost(url.hostname)) {
    return endpoint;
  }
  throw storeError(
    "NON_HTTPS_ENDPOINT_REJECTED",
    "Remote REST endpoints must use HTTPS (Ollama loopback HTTP is the only exception).",
  );
}

function parseBoundedInt(value, limit, fieldName) {
  if (value === undefined || value === null) return limit.default;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw storeError("UNBOUNDED_LIMIT_REJECTED", `${fieldName} must be a finite integer.`);
  }
  if (value < limit.min || value > limit.max) {
    throw storeError(
      "UNBOUNDED_LIMIT_REJECTED",
      `${fieldName} must be between ${limit.min} and ${limit.max}.`,
    );
  }
  return value;
}

function parseModelId(value, fieldName) {
  if (typeof value !== "string" || !MODEL_ID_PATTERN.test(value) || value.length > NIA_PROVIDER_LIMITS.model) {
    throw storeError("INVALID_PROVIDER_SHAPE", `${fieldName} must be a bounded model id.`);
  }
  return value;
}

function parseProviderId(value) {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value) || value.length > NIA_PROVIDER_LIMITS.id) {
    throw storeError("INVALID_PROVIDER_SHAPE", "Provider id must be a lowercase slug.");
  }
  return value;
}

function parseCapabilities(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw storeError("INVALID_PROVIDER_SHAPE", "Provider capabilities are required.");
  }
  for (const key of Object.keys(input)) {
    if (!NIA_PROVIDER_CAPABILITY_KEYS.includes(key)) {
      throw storeError("UNKNOWN_CAPABILITY", `Unknown provider capability "${key}".`);
    }
  }

  const requiredBooleans = ["streaming", "toolModeDisable", "cancellation", "attachments"];
  for (const key of requiredBooleans) {
    if (typeof input[key] !== "boolean") {
      throw storeError("INVALID_PROVIDER_SHAPE", `capabilities.${key} must be a boolean.`);
    }
  }

  const maxInputTokens = parseBoundedInt(
    input.maxInputTokens,
    NIA_PROVIDER_LIMITS.maxInputTokens,
    "capabilities.maxInputTokens",
  );
  const maxOutputTokens = parseBoundedInt(
    input.maxOutputTokens,
    NIA_PROVIDER_LIMITS.maxOutputTokens,
    "capabilities.maxOutputTokens",
  );

  const capabilities = {
    streaming: input.streaming,
    toolModeDisable: input.toolModeDisable,
    cancellation: input.cancellation,
    attachments: input.attachments,
    maxInputTokens,
    maxOutputTokens,
  };

  if (input.independentToolAuthority !== undefined) {
    if (typeof input.independentToolAuthority !== "boolean") {
      throw storeError("INVALID_PROVIDER_SHAPE", "capabilities.independentToolAuthority must be a boolean.");
    }
    capabilities.independentToolAuthority = input.independentToolAuthority;
  }
  if (input.riskAccepted !== undefined) {
    if (typeof input.riskAccepted !== "boolean") {
      throw storeError("INVALID_PROVIDER_SHAPE", "capabilities.riskAccepted must be a boolean.");
    }
    capabilities.riskAccepted = input.riskAccepted;
  }

  if (capabilities.independentToolAuthority === true && capabilities.riskAccepted !== true) {
    throw storeError(
      "RISK_ACCEPTANCE_REQUIRED",
      "Providers with unavoidable independent tool authority require explicit risk acceptance.",
    );
  }

  return capabilities;
}

function parseBounds(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    timeoutMs: parseBoundedInt(source.timeoutMs, NIA_PROVIDER_LIMITS.timeoutMs, "bounds.timeoutMs"),
    maxOutputBytes: parseBoundedInt(
      source.maxOutputBytes,
      NIA_PROVIDER_LIMITS.maxOutputBytes,
      "bounds.maxOutputBytes",
    ),
  };
}

function parseSupportedModels(defaultModel, supportedModels) {
  const model = parseModelId(defaultModel, "defaultModel");
  if (!Array.isArray(supportedModels) || supportedModels.length === 0) {
    throw storeError("INVALID_PROVIDER_SHAPE", "supportedModels must be a non-empty array.");
  }
  if (supportedModels.length > NIA_PROVIDER_LIMITS.maxSupportedModels) {
    throw storeError("INVALID_PROVIDER_SHAPE", "supportedModels exceeds the configured maximum.");
  }
  const parsed = supportedModels.map((entry, index) =>
    parseModelId(entry, `supportedModels[${index}]`),
  );
  if (!parsed.includes(model)) {
    throw storeError("MODEL_NOT_SUPPORTED", "defaultModel must be present in supportedModels.");
  }
  return { defaultModel: model, supportedModels: parsed };
}

function parseOpaqueSecretRef(ref) {
  if (ref == null) return null;
  if (
    !ref ||
    typeof ref !== "object" ||
    ref.kind !== "keychain-ref" ||
    ref.namespace !== NIA_PROVIDER_SECRET_NAMESPACE ||
    typeof ref.account !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    kind: "keychain-ref",
    namespace: NIA_PROVIDER_SECRET_NAMESPACE,
    account: ref.account,
  });
}

function normalizeRestProvider(input, { allowRememberFields = false } = {}) {
  assertNoPlaintextSecrets(input);
  assertNoForbiddenCliKeys(input);

  if (!input || typeof input !== "object" || input.kind !== "rest") {
    throw storeError("INVALID_PROVIDER_SHAPE", "REST provider kind is required.");
  }
  if (!NIA_REST_PROTOCOLS.includes(input.protocol)) {
    throw storeError("INVALID_PROVIDER_SHAPE", "Unknown REST protocol.");
  }
  if (typeof input.label !== "string" || input.label.length === 0 || input.label.length > NIA_PROVIDER_LIMITS.label) {
    throw storeError("INVALID_PROVIDER_SHAPE", "Provider label is invalid.");
  }
  if (typeof input.enabled !== "boolean") {
    throw storeError("INVALID_PROVIDER_SHAPE", "enabled must be a boolean.");
  }

  const id = parseProviderId(input.id);
  const endpoint = assertSafeRestEndpoint(input.endpoint, input.protocol);
  const models = parseSupportedModels(input.defaultModel, input.supportedModels);
  const capabilities = parseCapabilities(input.capabilities);
  const bounds = parseBounds(input.bounds);

  // rememberOnThisMac is never inferred from a found keychain entry.
  let rememberOnThisMac = false;
  let secretRef = null;
  if (allowRememberFields && input.rememberOnThisMac === true) {
    const parsedRef = parseOpaqueSecretRef(input.secretRef);
    if (parsedRef) {
      rememberOnThisMac = true;
      secretRef = parsedRef;
    }
  }

  return deepFreeze({
    id,
    kind: "rest",
    protocol: input.protocol,
    label: input.label,
    enabled: input.enabled,
    endpoint,
    defaultModel: models.defaultModel,
    supportedModels: models.supportedModels,
    capabilities,
    bounds,
    rememberOnThisMac,
    secretRef,
  });
}

function normalizeCliProvider(input) {
  assertNoPlaintextSecrets(input);
  assertNoForbiddenCliKeys(input);

  if (!input || typeof input !== "object" || input.kind !== "cli") {
    throw storeError("INVALID_PROVIDER_SHAPE", "CLI provider kind is required.");
  }
  if (!NIA_CLI_ADAPTER_IDS.includes(input.adapterId)) {
    throw storeError("UNKNOWN_CLI_ADAPTER", "CLI adapterId must be a fixed audited adapter.");
  }
  if (typeof input.label !== "string" || input.label.length === 0 || input.label.length > NIA_PROVIDER_LIMITS.label) {
    throw storeError("INVALID_PROVIDER_SHAPE", "Provider label is invalid.");
  }
  if (typeof input.enabled !== "boolean") {
    throw storeError("INVALID_PROVIDER_SHAPE", "enabled must be a boolean.");
  }

  const id = parseProviderId(input.id);
  const models = parseSupportedModels(input.defaultModel, input.supportedModels);
  const capabilities = parseCapabilities(input.capabilities);
  const bounds = parseBounds(input.bounds);

  return deepFreeze({
    id,
    kind: "cli",
    adapterId: input.adapterId,
    label: input.label,
    enabled: input.enabled,
    defaultModel: models.defaultModel,
    supportedModels: models.supportedModels,
    capabilities,
    bounds,
  });
}

function normalizeProvider(input, options) {
  if (!input || typeof input !== "object") {
    throw storeError("INVALID_PROVIDER_SHAPE", "Provider definition is required.");
  }
  if (input.kind === "rest") return normalizeRestProvider(input, options);
  if (input.kind === "cli") return normalizeCliProvider(input);
  throw storeError("INVALID_PROVIDER_SHAPE", "Provider kind must be rest or cli.");
}

function emptySnapshot() {
  return deepFreeze({
    activeProviderId: null,
    providers: [],
  });
}

async function atomicWriteFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fsp.writeFile(tempPath, content, "utf8");
  await fsp.rename(tempPath, filePath);
}

function createNiaProviderStore({ baseDir, secretStore } = {}) {
  if (typeof baseDir !== "string" || baseDir.length === 0) {
    throw storeError("INVALID_BASE_DIR", "A Nia provider store baseDir is required.");
  }
  if (
    !secretStore ||
    typeof secretStore.putNamespacedSecret !== "function" ||
    typeof secretStore.getNamespacedSecret !== "function" ||
    typeof secretStore.deleteNamespacedSecret !== "function"
  ) {
    throw storeError(
      "INVALID_SECRET_STORE",
      "A Keychain secret store with namespaced APIs is required.",
    );
  }

  const configPath = path.join(baseDir, CONFIG_FILE_NAME);
  /** @type {Map<string, string>} non-serializable process-memory REST keys */
  const sessionApiKeys = new Map();
  let writeChain = Promise.resolve();

  function enqueueWrite(task) {
    const next = writeChain.then(task, task);
    writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function readRawConfig() {
    try {
      const raw = await fsp.readFile(configPath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      return null;
    }
  }

  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return emptySnapshot();
    }

    const providers = [];
    const seen = new Set();
    const sourceProviders = Array.isArray(raw.providers) ? raw.providers : [];
    for (const entry of sourceProviders) {
      try {
        // Strip any plaintext secrets before normalization attempts.
        if (entry && typeof entry === "object") {
          for (const key of FORBIDDEN_SECRET_KEYS) {
            if (Object.prototype.hasOwnProperty.call(entry, key)) {
              delete entry[key];
            }
          }
        }
        const normalized = normalizeProvider(entry, { allowRememberFields: true });
        // Corrupt remember without a valid opaque ref collapses to false.
        if (normalized.kind === "rest" && normalized.rememberOnThisMac && !normalized.secretRef) {
          providers.push(
            deepFreeze({
              ...normalized,
              rememberOnThisMac: false,
              secretRef: null,
            }),
          );
        } else {
          providers.push(normalized);
        }
        seen.add(normalized.id);
      } catch {
        // Drop corrupt entries fail-closed.
      }
    }

    let activeProviderId = null;
    if (typeof raw.activeProviderId === "string" && seen.has(raw.activeProviderId)) {
      const active = providers.find((entry) => entry.id === raw.activeProviderId);
      if (active && active.enabled) {
        activeProviderId = active.id;
      }
    }

    return deepFreeze({
      activeProviderId,
      providers: providers.sort((left, right) => left.id.localeCompare(right.id)),
    });
  }

  async function readPersistedConfig() {
    const raw = await readRawConfig();
    return normalizeSnapshot(raw);
  }

  async function writeSnapshot(snapshot) {
    const serializable = {
      activeProviderId: snapshot.activeProviderId,
      providers: snapshot.providers.map((provider) => {
        if (provider.kind === "rest") {
          return {
            id: provider.id,
            kind: provider.kind,
            protocol: provider.protocol,
            label: provider.label,
            enabled: provider.enabled,
            endpoint: provider.endpoint,
            defaultModel: provider.defaultModel,
            supportedModels: provider.supportedModels,
            capabilities: provider.capabilities,
            bounds: provider.bounds,
            rememberOnThisMac: provider.rememberOnThisMac === true,
            secretRef: provider.secretRef,
          };
        }
        return {
          id: provider.id,
          kind: provider.kind,
          adapterId: provider.adapterId,
          label: provider.label,
          enabled: provider.enabled,
          defaultModel: provider.defaultModel,
          supportedModels: provider.supportedModels,
          capabilities: provider.capabilities,
          bounds: provider.bounds,
        };
      }),
    };
    const text = JSON.stringify(serializable, null, 2);
    if (/(apiKey|access_token|"token"|password|sk-live)/i.test(text)) {
      throw storeError("PLAINTEXT_SECRET_REJECTED", "Refusing to persist plaintext secrets.");
    }
    await atomicWriteFile(configPath, `${text}\n`);
  }

  async function mutate(mutator) {
    return enqueueWrite(async () => {
      const current = await readPersistedConfig();
      const next = await mutator({
        activeProviderId: current.activeProviderId,
        providers: current.providers.map((entry) => ({ ...entry })),
      });
      const normalized = normalizeSnapshot(next);
      await writeSnapshot(normalized);
      return normalized;
    });
  }

  async function listProviders() {
    const snapshot = await readPersistedConfig();
    return snapshot.providers;
  }

  async function getProvider(id) {
    const snapshot = await readPersistedConfig();
    return snapshot.providers.find((entry) => entry.id === id) ?? null;
  }

  async function getActiveProviderId() {
    const snapshot = await readPersistedConfig();
    return snapshot.activeProviderId;
  }

  async function upsertRestProvider(input) {
    const normalized = normalizeRestProvider(input, { allowRememberFields: false });
    const snapshot = await mutate((current) => {
      const providers = current.providers.filter((entry) => entry.id !== normalized.id);
      const previous = current.providers.find((entry) => entry.id === normalized.id);
      const merged =
        previous && previous.kind === "rest"
          ? deepFreeze({
              ...normalized,
              rememberOnThisMac: previous.rememberOnThisMac,
              secretRef: previous.secretRef,
            })
          : normalized;
      providers.push(merged);
      return {
        activeProviderId: current.activeProviderId,
        providers,
      };
    });
    return snapshot.providers.find((entry) => entry.id === normalized.id);
  }

  async function upsertCliProvider(input) {
    const normalized = normalizeCliProvider(input);
    const snapshot = await mutate((current) => {
      const providers = current.providers.filter((entry) => entry.id !== normalized.id);
      providers.push(normalized);
      let activeProviderId = current.activeProviderId;
      if (activeProviderId === normalized.id && !normalized.enabled) {
        activeProviderId = null;
      }
      return { activeProviderId, providers };
    });
    return snapshot.providers.find((entry) => entry.id === normalized.id);
  }

  async function setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") {
      throw storeError("INVALID_PROVIDER_SHAPE", "enabled must be a boolean.");
    }
    const snapshot = await mutate((current) => {
      const providers = current.providers.map((entry) => {
        if (entry.id !== id) return entry;
        return deepFreeze({ ...entry, enabled });
      });
      if (!providers.some((entry) => entry.id === id)) {
        throw storeError("PROVIDER_NOT_FOUND", `Provider "${id}" was not found.`);
      }
      let activeProviderId = current.activeProviderId;
      if (activeProviderId === id && !enabled) {
        activeProviderId = null;
      }
      return { activeProviderId, providers };
    });
    return snapshot.providers.find((entry) => entry.id === id);
  }

  async function setActiveDefault(id) {
    const snapshot = await mutate((current) => {
      const provider = current.providers.find((entry) => entry.id === id);
      if (!provider) {
        throw storeError("PROVIDER_NOT_FOUND", `Provider "${id}" was not found.`);
      }
      if (!provider.enabled) {
        throw storeError("PROVIDER_DISABLED", `Provider "${id}" is disabled.`);
      }
      return {
        activeProviderId: id,
        providers: current.providers,
      };
    });
    return snapshot.activeProviderId;
  }

  function setSessionApiKey(id, apiKey) {
    if (typeof id !== "string" || id.length === 0) {
      throw storeError("INVALID_PROVIDER_SHAPE", "Provider id is required.");
    }
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw storeError("INVALID_PROVIDER_SHAPE", "A non-empty session API key is required.");
    }
    sessionApiKeys.set(id, apiKey);
  }

  function clearSessionApiKey(id) {
    sessionApiKeys.delete(id);
  }

  function getSessionApiKey(id) {
    return sessionApiKeys.get(id) ?? null;
  }

  async function rememberOnThisMac(id, remember) {
    if (typeof remember !== "boolean") {
      throw storeError("INVALID_PROVIDER_SHAPE", "rememberOnThisMac must be a boolean.");
    }

    const provider = await getProvider(id);
    if (!provider) {
      throw storeError("PROVIDER_NOT_FOUND", `Provider "${id}" was not found.`);
    }
    if (provider.kind !== "rest") {
      throw storeError("REMEMBER_NOT_SUPPORTED", "Only REST providers support Keychain remember.");
    }

    if (remember) {
      const apiKey = sessionApiKeys.get(id);
      if (typeof apiKey !== "string" || apiKey.length === 0) {
        throw storeError(
          "SESSION_KEY_REQUIRED",
          "A process-memory API key is required before rememberOnThisMac.",
        );
      }
      const secretRef = await secretStore.putNamespacedSecret(
        { namespace: NIA_PROVIDER_SECRET_NAMESPACE, account: id },
        apiKey,
      );
      const snapshot = await mutate((current) => {
        const providers = current.providers.map((entry) => {
          if (entry.id !== id || entry.kind !== "rest") return entry;
          return deepFreeze({
            ...entry,
            rememberOnThisMac: true,
            secretRef,
          });
        });
        return { activeProviderId: current.activeProviderId, providers };
      });
      return snapshot.providers.find((entry) => entry.id === id);
    }

    const existingRef = provider.secretRef ?? {
      kind: "keychain-ref",
      namespace: NIA_PROVIDER_SECRET_NAMESPACE,
      account: id,
    };
    try {
      await secretStore.deleteNamespacedSecret(existingRef);
    } catch {
      // Best-effort delete; metadata still clears remember.
    }

    const snapshot = await mutate((current) => {
      const providers = current.providers.map((entry) => {
        if (entry.id !== id || entry.kind !== "rest") return entry;
        return deepFreeze({
          ...entry,
          rememberOnThisMac: false,
          secretRef: null,
        });
      });
      return { activeProviderId: current.activeProviderId, providers };
    });
    return snapshot.providers.find((entry) => entry.id === id);
  }

  async function resolveModelOverride({ providerId, modelOverride } = {}) {
    const provider = await getProvider(providerId);
    if (!provider) {
      throw storeError("PROVIDER_NOT_FOUND", `Provider "${providerId}" was not found.`);
    }
    if (modelOverride == null || modelOverride === "") {
      return { model: provider.defaultModel, overridden: false };
    }
    if (!provider.supportedModels.includes(modelOverride)) {
      throw storeError(
        "MODEL_NOT_SUPPORTED",
        `Model "${modelOverride}" is not reported as supported by the selected provider.`,
      );
    }
    return { model: modelOverride, overridden: true };
  }

  async function resolveRuntimeApiKey(id) {
    const sessionKey = sessionApiKeys.get(id);
    if (typeof sessionKey === "string" && sessionKey.length > 0) {
      return sessionKey;
    }
    const provider = await getProvider(id);
    if (
      provider &&
      provider.kind === "rest" &&
      provider.rememberOnThisMac === true &&
      provider.secretRef
    ) {
      const buffer = await secretStore.getNamespacedSecret(provider.secretRef);
      return buffer.toString("utf8");
    }
    return null;
  }

  return Object.freeze({
    clearSessionApiKey,
    getActiveProviderId,
    getProvider,
    getSessionApiKey,
    listProviders,
    readPersistedConfig,
    rememberOnThisMac,
    resolveModelOverride,
    resolveRuntimeApiKey,
    setActiveDefault,
    setEnabled,
    setSessionApiKey,
    upsertCliProvider,
    upsertRestProvider,
  });
}

module.exports = {
  NIA_CLI_ADAPTER_IDS,
  NIA_PROVIDER_CAPABILITY_KEYS,
  NIA_PROVIDER_LIMITS,
  NIA_PROVIDER_STORE_ERROR_CODES,
  NIA_REST_PROTOCOLS,
  NiaProviderStoreError,
  createNiaProviderStore,
};
