"use strict";

/**
 * Safe model discovery and connection tests for Nia REST/CLI providers.
 *
 * Caps model count/name length/time. Discovery never sends a real prompt.
 */

const {
  ANTHROPIC_CURATED_MODELS,
  buildConnectionTestRequest,
  buildDiscoveryRequest,
  parseModelList,
  redactSecrets,
} = require("./nia-rest-protocols.cjs");
const { createNiaCliRegistry } = require("./nia-cli-registry.cjs");

const NIA_MODEL_DISCOVERY_LIMITS = Object.freeze({
  maxModels: 64,
  maxNameLength: 160,
  timeoutMs: 10_000,
});

const NIA_MODEL_DISCOVERY_ERROR_CODES = Object.freeze([
  "INVALID_REQUEST",
  "TIMEOUT",
  "TRANSPORT_ERROR",
  "MALFORMED_RESPONSE",
  "PROVIDER_HTTP_ERROR",
  "UNAVAILABLE",
]);

class NiaModelDiscoveryError extends Error {
  constructor(code, message, details) {
    if (!NIA_MODEL_DISCOVERY_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia model discovery error code: ${code}`);
    }
    super(message);
    this.name = "NiaModelDiscoveryError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function discoveryError(code, message, details) {
  return new NiaModelDiscoveryError(code, message, details);
}

function capModels(models) {
  const capped = [];
  for (const name of models) {
    if (typeof name !== "string") continue;
    if (name.length === 0 || name.length > NIA_MODEL_DISCOVERY_LIMITS.maxNameLength) continue;
    capped.push(name);
    if (capped.length >= NIA_MODEL_DISCOVERY_LIMITS.maxModels) break;
  }
  return capped;
}

function createNiaModelDiscovery({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cliRegistry = createNiaCliRegistry(),
  now = () => Date.now(),
} = {}) {
  async function httpJson(request, { signal } = {}) {
    if (typeof fetchImpl !== "function") {
      throw discoveryError("TRANSPORT_ERROR", "fetch is unavailable.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NIA_MODEL_DISCOVERY_LIMITS.timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw discoveryError(
          "PROVIDER_HTTP_ERROR",
          redactSecrets(`HTTP ${response.status}: ${text.slice(0, 200)}`),
          { status: response.status },
        );
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw discoveryError("MALFORMED_RESPONSE", "Discovery response was not JSON.");
      }
    } catch (error) {
      if (error instanceof NiaModelDiscoveryError) throw error;
      if (error?.name === "AbortError") {
        throw discoveryError("TIMEOUT", "Model discovery timed out.");
      }
      throw discoveryError(
        "TRANSPORT_ERROR",
        redactSecrets(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  async function discoverRestModels({ provider, apiKey = null, signal = null }) {
    if (!provider || provider.kind !== "rest") {
      throw discoveryError("INVALID_REQUEST", "REST provider required.");
    }
    const started = now();
    const request = buildDiscoveryRequest({
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      apiKey,
    });
    if (request.kind === "curated") {
      return Object.freeze({
        available: true,
        models: capModels(request.models || ANTHROPIC_CURATED_MODELS),
        durationMs: Math.max(0, now() - started),
        logSafe: request.logSafe,
      });
    }
    const json = await httpJson(request, { signal });
    const models = capModels(parseModelList(provider.protocol, json));
    return Object.freeze({
      available: true,
      models,
      durationMs: Math.max(0, now() - started),
      logSafe: request.logSafe,
    });
  }

  async function testRestConnection({ provider, apiKey = null, signal = null }) {
    if (!provider || provider.kind !== "rest") {
      throw discoveryError("INVALID_REQUEST", "REST provider required.");
    }
    const started = now();
    const request = buildConnectionTestRequest({
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      apiKey,
    });
    await httpJson(request, { signal });
    return Object.freeze({
      available: true,
      status: "connected",
      durationMs: Math.max(0, now() - started),
      logSafe: request.logSafe,
    });
  }

  async function discoverCli({ adapterId }) {
    const started = now();
    const detection = cliRegistry.detectAdapter(adapterId);
    return Object.freeze({
      available: detection.available === true,
      adapterId,
      models: detection.available
        ? capModels([`${adapterId}-default`].filter(Boolean))
        : [],
      detection: Object.freeze({
        available: detection.available,
        command: detection.command,
        version: detection.version,
        generationOnly: detection.generationOnly,
        toolModeDisable: detection.toolModeDisable,
        agentic: detection.agentic,
        // Never return raw absolute path to renderer consumers via discovery IPC.
        pathPresent: Boolean(detection.path),
      }),
      durationMs: Math.max(0, now() - started),
      logSafe: Object.freeze({
        adapterId,
        available: detection.available,
        command: detection.command,
      }),
    });
  }

  async function testCliConnection({ adapterId }) {
    const result = await discoverCli({ adapterId });
    if (!result.available) {
      throw discoveryError("UNAVAILABLE", `CLI adapter "${adapterId}" is unavailable.`);
    }
    return Object.freeze({
      available: true,
      status: "connected",
      durationMs: result.durationMs,
      logSafe: result.logSafe,
    });
  }

  return Object.freeze({
    discoverCli,
    discoverRestModels,
    testCliConnection,
    testRestConnection,
  });
}

module.exports = {
  NIA_MODEL_DISCOVERY_ERROR_CODES,
  NIA_MODEL_DISCOVERY_LIMITS,
  NiaModelDiscoveryError,
  capModels,
  createNiaModelDiscovery,
};
