"use strict";

/**
 * Nia provider runtime — unified async event protocol over REST and CLI adapters.
 *
 * Events: started | delta | tool | completed | failed | cancelled
 * Run IDs are generated in main and bound to the trusted originating renderer.
 *
 * Optional host-owned browser tool loops reuse the Browser command dispatcher
 * with connectionId `nia:<runId>` (owner.kind = "nia").
 */

const crypto = require("node:crypto");

const { createNiaRestProvider, NiaRestProviderError } = require("./nia-rest-provider.cjs");
const { createNiaCliProvider, NiaCliProviderError } = require("./nia-cli-provider.cjs");
const { createNiaCliRegistry } = require("./nia-cli-registry.cjs");
const { createNiaModelDiscovery } = require("./nia-model-discovery.cjs");
const { redactSecrets } = require("./nia-rest-protocols.cjs");
const {
  NIA_BROWSER_MAX_TOOL_ROUNDS,
  NIA_BROWSER_TOOL_NAME,
  createNiaBrowserSession,
  niaBrowserToolDefinitions,
  serializeToolErrorForModel,
  serializeToolResultForModel,
} = require("./nia-browser-tools.cjs");

const NIA_PROVIDER_EVENT_TYPES = Object.freeze([
  "started",
  "delta",
  "tool",
  "completed",
  "failed",
  "cancelled",
]);

const NIA_PROVIDER_RUNTIME_ERROR_CODES = Object.freeze([
  "INVALID_REQUEST",
  "PROVIDER_NOT_FOUND",
  "PROVIDER_DISABLED",
  "RUN_NOT_FOUND",
  "OWNER_MISMATCH",
  "RISK_ACCEPTANCE_REQUIRED",
  "SESSION_KEY_REQUIRED",
  "BROWSER_TOOLS_UNAVAILABLE",
]);

const TOOL_LOOP_PROTOCOLS = Object.freeze(new Set([
  "anthropic",
  "openai",
  "openai-compatible",
]));

class NiaProviderRuntimeError extends Error {
  constructor(code, message, details) {
    if (!NIA_PROVIDER_RUNTIME_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia provider runtime error code: ${code}`);
    }
    super(message);
    this.name = "NiaProviderRuntimeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function runtimeError(code, message, details) {
  return new NiaProviderRuntimeError(code, message, details);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function createRunId() {
  return `nia-run-${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeBrowserTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.windowId !== "string" || typeof value.tabId !== "string") return null;
  if (value.windowId.length === 0 || value.tabId.length === 0) return null;
  return Object.freeze({ windowId: value.windowId, tabId: value.tabId });
}

function createNiaProviderRuntime({
  providerStore,
  restProvider = createNiaRestProvider(),
  cliProvider = createNiaCliProvider(),
  cliRegistry = createNiaCliRegistry(),
  modelDiscovery = createNiaModelDiscovery({ cliRegistry }),
  browserDispatcher = null,
  isBrowserAutomationAllowed = null,
} = {}) {
  if (!providerStore || typeof providerStore.getProvider !== "function") {
    throw runtimeError("INVALID_REQUEST", "A Nia provider store is required.");
  }

  /** @type {Map<string, object>} */
  const runs = new Map();
  /** @type {Map<number, Set<string>>} webContentsId -> runIds */
  const runsByOwner = new Map();
  /** @type {Map<number, Set<function>>} */
  const subscribersByOwner = new Map();

  function emit(ownerWebContentsId, event) {
    const frozen = deepFreeze({ ...event });
    const listeners = subscribersByOwner.get(ownerWebContentsId);
    if (!listeners) return frozen;
    for (const listener of [...listeners]) {
      try {
        listener(frozen);
      } catch {
        // isolate listener failures
      }
    }
    return frozen;
  }

  function bindOwner(ownerWebContentsId, runId) {
    let set = runsByOwner.get(ownerWebContentsId);
    if (!set) {
      set = new Set();
      runsByOwner.set(ownerWebContentsId, set);
    }
    set.add(runId);
  }

  function unbindOwner(ownerWebContentsId, runId) {
    const set = runsByOwner.get(ownerWebContentsId);
    if (!set) return;
    set.delete(runId);
    if (set.size === 0) runsByOwner.delete(ownerWebContentsId);
  }

  function subscribe(ownerWebContentsId, listener) {
    if (typeof ownerWebContentsId !== "number" || typeof listener !== "function") {
      throw runtimeError("INVALID_REQUEST", "subscribe requires owner id and listener.");
    }
    let set = subscribersByOwner.get(ownerWebContentsId);
    if (!set) {
      set = new Set();
      subscribersByOwner.set(ownerWebContentsId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) subscribersByOwner.delete(ownerWebContentsId);
    };
  }

  function resolveDispatcher() {
    if (typeof browserDispatcher === "function") return browserDispatcher();
    return browserDispatcher;
  }

  function assertBrowserToolsReady(enableBrowserTools) {
    if (enableBrowserTools !== true) return null;
    if (typeof isBrowserAutomationAllowed === "function" && !isBrowserAutomationAllowed()) {
      throw runtimeError(
        "BROWSER_TOOLS_UNAVAILABLE",
        "Browser automation is disabled or security gates are not verified.",
      );
    }
    const dispatcher = resolveDispatcher();
    if (!dispatcher || typeof dispatcher.dispatch !== "function") {
      throw runtimeError(
        "BROWSER_TOOLS_UNAVAILABLE",
        "Browser dispatcher is unavailable for Nia tool loops.",
      );
    }
    return dispatcher;
  }

  async function runBrowserToolLoop({
    run,
    provider,
    apiKey,
    model,
    prompt,
    browserTarget,
    dispatcher,
  }) {
    if (!TOOL_LOOP_PROTOCOLS.has(provider.protocol)) {
      throw runtimeError(
        "BROWSER_TOOLS_UNAVAILABLE",
        `Host browser tools require anthropic/openai/openai-compatible (got ${provider.protocol}).`,
      );
    }
    if (typeof restProvider.executeChatTurn !== "function") {
      throw runtimeError("BROWSER_TOOLS_UNAVAILABLE", "REST chat turn executor is unavailable.");
    }

    const connectionId = `nia:${run.runId}`;
    const session = createNiaBrowserSession({
      dispatcher,
      connectionId,
      browserTarget,
    });
    run.browserSession = session;

    const tools = niaBrowserToolDefinitions();
    const messages = [
      {
        role: "system",
        content: [
          "You are Nia inside the Auris desktop browser.",
          "Use the auris_browser tool when the user asks you to browse, open pages, read, or act.",
          browserTarget
            ? `Default target windowId=${browserTarget.windowId} tabId=${browserTarget.tabId}.`
            : "No attached tab; prefer action open to create an AiSandbox tab.",
          "After tools finish, answer the user briefly in natural language.",
        ].join(" "),
      },
      { role: "user", content: prompt },
    ];

    try {
      for (let round = 0; round < NIA_BROWSER_MAX_TOOL_ROUNDS; round += 1) {
        if (run.controller.signal.aborted || run.status === "cancelled") return;
        const turn = await restProvider.executeChatTurn({
          provider,
          apiKey,
          model,
          messages,
          tools,
          signal: run.controller.signal,
          onDelta: (chunk) => {
            if (run.status !== "started") return;
            run.text += chunk;
            emit(run.ownerWebContentsId, {
              type: "delta",
              runId: run.runId,
              text: chunk,
            });
          },
        });

        if (run.controller.signal.aborted || run.status === "cancelled") return;
        if (!run.text && turn.text) {
          run.text = turn.text;
        }

        const toolCalls = Array.isArray(turn.toolCalls) ? turn.toolCalls : [];
        if (toolCalls.length === 0) {
          run.status = "completed";
          emit(run.ownerWebContentsId, {
            type: "completed",
            runId: run.runId,
            text: run.text,
          });
          return;
        }

        messages.push({
          role: "assistant",
          content: turn.text || "",
          toolCalls: toolCalls.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          })),
        });

        for (const call of toolCalls) {
          if (run.controller.signal.aborted || run.status === "cancelled") return;
          const action =
            call?.arguments && typeof call.arguments === "object"
              ? call.arguments.action
              : undefined;
          emit(run.ownerWebContentsId, {
            type: "tool",
            runId: run.runId,
            name: call.name || NIA_BROWSER_TOOL_NAME,
            action: typeof action === "string" ? action : null,
            status: "started",
          });

          let content;
          let status = "completed";
          try {
            if (call.name !== NIA_BROWSER_TOOL_NAME) {
              content = serializeToolErrorForModel({
                code: "CAPABILITY_NOT_VERIFIED",
                message: `Unknown tool: ${String(call.name)}`,
              });
              status = "failed";
            } else {
              const result = await session.executeToolCall(call.arguments, run.controller.signal);
              content = serializeToolResultForModel(result);
            }
          } catch (error) {
            status = "failed";
            content = serializeToolErrorForModel(error);
          }

          emit(run.ownerWebContentsId, {
            type: "tool",
            runId: run.runId,
            name: call.name || NIA_BROWSER_TOOL_NAME,
            action: typeof action === "string" ? action : null,
            status,
            summary: content.slice(0, 280),
          });

          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name || NIA_BROWSER_TOOL_NAME,
            content,
          });
        }
      }

      run.status = "failed";
      emit(run.ownerWebContentsId, {
        type: "failed",
        runId: run.runId,
        code: "INVALID_REQUEST",
        message: `Browser tool loop exceeded ${NIA_BROWSER_MAX_TOOL_ROUNDS} rounds.`,
      });
    } finally {
      try {
        await session.dispose();
      } catch {
        // Best-effort lease release.
      }
      run.browserSession = null;
    }
  }

  async function startRun({
    ownerWebContentsId,
    ownerWindowId = null,
    providerId = null,
    modelOverride = null,
    prompt,
    enableBrowserTools = false,
    browserTarget = null,
  }) {
    if (typeof ownerWebContentsId !== "number") {
      throw runtimeError("INVALID_REQUEST", "ownerWebContentsId must be a number from main.");
    }
    if (typeof prompt !== "string" || prompt.length === 0) {
      throw runtimeError("INVALID_REQUEST", "Prompt is required.");
    }

    const normalizedTarget = normalizeBrowserTarget(browserTarget);
    const dispatcher = assertBrowserToolsReady(enableBrowserTools === true);

    const activeId = providerId ?? (await providerStore.getActiveProviderId());
    if (!activeId) throw runtimeError("PROVIDER_NOT_FOUND", "No active provider is configured.");
    const provider = await providerStore.getProvider(activeId);
    if (!provider) throw runtimeError("PROVIDER_NOT_FOUND", `Provider "${activeId}" was not found.`);
    if (!provider.enabled) throw runtimeError("PROVIDER_DISABLED", `Provider "${activeId}" is disabled.`);

    const modelResolution = await providerStore.resolveModelOverride({
      providerId: activeId,
      modelOverride,
    });
    const model = modelResolution.model;

    if (
      provider.capabilities?.independentToolAuthority === true &&
      provider.capabilities?.riskAccepted !== true
    ) {
      throw runtimeError(
        "RISK_ACCEPTANCE_REQUIRED",
        "Provider requires explicit risk acceptance before launch.",
      );
    }

    if (enableBrowserTools === true && provider.kind === "cli") {
      throw runtimeError(
        "BROWSER_TOOLS_UNAVAILABLE",
        "In-app browser tools require a REST provider (anthropic/openai/openai-compatible).",
      );
    }

    const runId = createRunId();
    const controller = new AbortController();
    const run = {
      runId,
      ownerWebContentsId,
      ownerWindowId,
      providerId: activeId,
      model,
      status: "started",
      controller,
      text: "",
      browserSession: null,
      enableBrowserTools: enableBrowserTools === true,
    };
    runs.set(runId, run);
    bindOwner(ownerWebContentsId, runId);

    emit(ownerWebContentsId, {
      type: "started",
      runId,
      providerId: activeId,
      model,
      ownerWebContentsId,
      enableBrowserTools: enableBrowserTools === true,
    });

    queueMicrotask(() => {
      void (async () => {
        try {
          if (provider.kind === "rest") {
            const apiKey = await providerStore.resolveRuntimeApiKey(activeId);
            if (provider.protocol !== "ollama" && (!apiKey || apiKey.length === 0)) {
              throw runtimeError("SESSION_KEY_REQUIRED", "REST provider API key is required.");
            }

            if (enableBrowserTools === true) {
              await runBrowserToolLoop({
                run,
                provider,
                apiKey,
                model,
                prompt,
                browserTarget: normalizedTarget,
                dispatcher,
              });
              return;
            }

            const result = await restProvider.executePrompt({
              provider,
              apiKey,
              model,
              prompt,
              stream: provider.capabilities?.streaming === true,
              signal: controller.signal,
              onDelta: (chunk) => {
                if (run.status !== "started") return;
                run.text += chunk;
                emit(ownerWebContentsId, {
                  type: "delta",
                  runId,
                  text: chunk,
                });
              },
            });
            if (controller.signal.aborted || run.status === "cancelled") return;
            run.status = "completed";
            if (!run.text && result.text) run.text = result.text;
            emit(ownerWebContentsId, {
              type: "completed",
              runId,
              text: run.text,
            });
          } else if (provider.kind === "cli") {
            const detection = cliRegistry.detectAdapter(provider.adapterId);
            const result = await cliProvider.executePrompt({
              provider,
              model,
              prompt,
              signal: controller.signal,
              detection,
              onDelta: (chunk) => {
                if (run.status !== "started") return;
                run.text += chunk;
                emit(ownerWebContentsId, {
                  type: "delta",
                  runId,
                  text: chunk,
                });
              },
            });
            if (controller.signal.aborted || run.status === "cancelled") return;
            run.status = "completed";
            if (!run.text && result.text) run.text = result.text;
            emit(ownerWebContentsId, {
              type: "completed",
              runId,
              text: run.text,
            });
          } else {
            throw runtimeError("INVALID_REQUEST", "Unknown provider kind.");
          }
        } catch (error) {
          if (run.status === "cancelled") return;
          if (controller.signal.aborted) {
            run.status = "cancelled";
            emit(ownerWebContentsId, { type: "cancelled", runId });
            return;
          }
          const code =
            error?.code ||
            (error instanceof NiaRestProviderError || error instanceof NiaCliProviderError
              ? error.code
              : "FAILED");
          if (code === "CANCELLED") {
            run.status = "cancelled";
            emit(ownerWebContentsId, { type: "cancelled", runId });
            return;
          }
          run.status = "failed";
          emit(ownerWebContentsId, {
            type: "failed",
            runId,
            code: typeof code === "string" ? code : "FAILED",
            message: redactSecrets(error instanceof Error ? error.message : String(error)),
          });
        } finally {
          if (run.browserSession) {
            try {
              await run.browserSession.dispose();
            } catch {
              // ignore
            }
            run.browserSession = null;
          }
          unbindOwner(ownerWebContentsId, runId);
        }
      })();
    });

    return deepFreeze({
      runId,
      providerId: activeId,
      model,
      ownerWebContentsId,
      enableBrowserTools: enableBrowserTools === true,
    });
  }

  function cancelRun({ runId, ownerWebContentsId }) {
    const run = runs.get(runId);
    if (!run) throw runtimeError("RUN_NOT_FOUND", `Run "${runId}" was not found.`);
    if (run.ownerWebContentsId !== ownerWebContentsId) {
      throw runtimeError("OWNER_MISMATCH", "Cannot cancel a run owned by another renderer.");
    }
    if (run.status !== "started") {
      return deepFreeze({ runId, cancelled: false, status: run.status });
    }
    run.status = "cancelled";
    try {
      run.controller.abort();
    } catch {
      // ignore
    }
    if (run.browserSession) {
      void Promise.resolve(run.browserSession.dispose()).catch(() => undefined);
      run.browserSession = null;
    }
    emit(ownerWebContentsId, { type: "cancelled", runId });
    unbindOwner(ownerWebContentsId, runId);
    return deepFreeze({ runId, cancelled: true, status: "cancelled" });
  }

  function cancelAllForOwner(ownerWebContentsId, { dropSubscribers = true } = {}) {
    const set = runsByOwner.get(ownerWebContentsId);
    if (!set) return 0;
    let count = 0;
    for (const runId of [...set]) {
      try {
        cancelRun({ runId, ownerWebContentsId });
        count += 1;
      } catch {
        // ignore
      }
    }
    if (dropSubscribers) subscribersByOwner.delete(ownerWebContentsId);
    return count;
  }

  function getRun({ runId, ownerWebContentsId }) {
    const run = runs.get(runId);
    if (!run) throw runtimeError("RUN_NOT_FOUND", `Run "${runId}" was not found.`);
    if (run.ownerWebContentsId !== ownerWebContentsId) {
      throw runtimeError("OWNER_MISMATCH", "Cannot inspect a run owned by another renderer.");
    }
    return deepFreeze({
      runId: run.runId,
      status: run.status,
      providerId: run.providerId,
      model: run.model,
      ownerWebContentsId: run.ownerWebContentsId,
      enableBrowserTools: run.enableBrowserTools === true,
    });
  }

  return Object.freeze({
    cancelAllForOwner,
    cancelRun,
    getRun,
    modelDiscovery,
    startRun,
    subscribe,
    NIA_PROVIDER_EVENT_TYPES,
  });
}

module.exports = {
  NIA_PROVIDER_EVENT_TYPES,
  NIA_PROVIDER_RUNTIME_ERROR_CODES,
  NiaProviderRuntimeError,
  createNiaProviderRuntime,
  createRunId,
};
