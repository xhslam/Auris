"use strict";

/**
 * Narrow Nia provider IPC for trusted browser-chrome and Notes renderers only.
 *
 * Run IDs are generated in main. Ownership is bound to event.sender (webContents.id).
 * Renderer-supplied owner/caller IDs are ignored/rejected.
 */

const { deepFreeze } = require("../browser/browser-registry.cjs");

const NIA_COMMAND_CHANNEL = "auris-nia:command";
const NIA_EVENT_CHANNEL = "auris-nia:event";

const NIA_IPC_COMMANDS = Object.freeze([
  "start",
  "cancel",
  "getRun",
  "subscribe",
  "unsubscribe",
  "listProviders",
  "discoverModels",
  "testConnection",
  "upsertRestProvider",
  "upsertCliProvider",
  "setSessionApiKey",
  "clearSessionApiKey",
  "setActiveDefault",
  "rememberOnThisMac",
]);

const NIA_CALLER_KINDS = Object.freeze(["browser-chrome", "notes"]);

const COMMAND_SET = new Set(NIA_IPC_COMMANDS);

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

const REST_PROVIDER_KEYS = Object.freeze([
  "id",
  "kind",
  "protocol",
  "label",
  "enabled",
  "endpoint",
  "defaultModel",
  "supportedModels",
  "capabilities",
  "bounds",
]);

const CLI_PROVIDER_KEYS = Object.freeze([
  "id",
  "kind",
  "adapterId",
  "label",
  "enabled",
  "defaultModel",
  "supportedModels",
  "capabilities",
  "bounds",
]);

class NiaIpcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NiaIpcError";
    this.code = code;
  }
}

function strictObject(value, allowedKeys) {
  const object = value === undefined ? {} : value;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new TypeError("Nia command payload must be an object");
  }
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) {
      throw new TypeError(`Unknown Nia command key: ${key}`);
    }
  }
  return object;
}

function createNiaIpc({
  ipcMain,
  runtime,
  providerStore,
  resolveCallerKind,
}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Nia IPC requires ipcMain.");
  }
  if (!runtime || typeof runtime.startRun !== "function") {
    throw new TypeError("Nia IPC requires a provider runtime.");
  }
  if (typeof resolveCallerKind !== "function") {
    throw new TypeError("Nia IPC requires resolveCallerKind.");
  }

  const subscribers = new Map();
  const destroyHandlers = new Map();
  const navigateHandlers = new Map();
  let registered = false;

  function requireTrustedCaller(event) {
    const kind = resolveCallerKind(event);
    if (!NIA_CALLER_KINDS.includes(kind)) {
      throw new NiaIpcError("UNTRUSTED_CALLER", "Nia IPC caller is not a trusted renderer.");
    }
    return kind;
  }

  function ownerId(event) {
    return event?.sender?.id;
  }

  function attachLifecycle(webContents) {
    if (!webContents || destroyHandlers.has(webContents)) return;

    const onDestroyed = () => {
      runtime.cancelAllForOwner(webContents.id);
      unsubscribe(webContents);
      detachLifecycle(webContents);
    };
    destroyHandlers.set(webContents, onDestroyed);
    webContents.once?.("destroyed", onDestroyed);

    if (typeof webContents.on === "function") {
      const onNavigate = () => {
        runtime.cancelAllForOwner(webContents.id, { dropSubscribers: false });
      };
      // Cancel in-flight provider work on navigation for browser chrome.
      webContents.on("did-navigate", onNavigate);
      webContents.on("did-navigate-in-page", onNavigate);
      navigateHandlers.set(webContents, onNavigate);
    }
  }

  function detachLifecycle(webContents) {
    const onDestroyed = destroyHandlers.get(webContents);
    if (onDestroyed) {
      destroyHandlers.delete(webContents);
      webContents.removeListener?.("destroyed", onDestroyed);
    }
    const onNavigate = navigateHandlers.get(webContents);
    if (onNavigate) {
      navigateHandlers.delete(webContents);
      webContents.removeListener?.("did-navigate", onNavigate);
      webContents.removeListener?.("did-navigate-in-page", onNavigate);
    }
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed?.()) return false;
    if (subscribers.has(webContents)) return false;
    const ownerWebContentsId = webContents.id;
    const unsubscribeRuntime = runtime.subscribe(ownerWebContentsId, (event) => {
      if (webContents.isDestroyed?.()) return;
      // Discard late events if this sender is no longer subscribed.
      if (!subscribers.has(webContents)) return;
      try {
        webContents.send(NIA_EVENT_CHANNEL, event);
      } catch {
        unsubscribe(webContents);
      }
    });
    subscribers.set(webContents, unsubscribeRuntime);
    attachLifecycle(webContents);
    return true;
  }

  function unsubscribe(webContents) {
    const unsub = subscribers.get(webContents);
    if (unsub) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    const removed = subscribers.delete(webContents);
    return removed;
  }

  function parsePayload(command, value) {
    switch (command) {
      case "subscribe":
      case "unsubscribe":
      case "listProviders":
        return strictObject(value, []);
      case "start": {
        const payload = strictObject(value, [
          "providerId",
          "modelOverride",
          "prompt",
          "enableBrowserTools",
          "browserTarget",
        ]);
        // Reject spoofed ownership fields if a hostile renderer adds them —
        // strictObject already rejects unknown keys like ownerWebContentsId.
        if (typeof payload.prompt !== "string" || payload.prompt.length === 0) {
          throw new TypeError("Nia start requires a prompt string.");
        }
        if (payload.providerId !== undefined && typeof payload.providerId !== "string") {
          throw new TypeError("Invalid providerId.");
        }
        if (payload.modelOverride !== undefined && typeof payload.modelOverride !== "string") {
          throw new TypeError("Invalid modelOverride.");
        }
        if (
          payload.enableBrowserTools !== undefined
          && typeof payload.enableBrowserTools !== "boolean"
        ) {
          throw new TypeError("Invalid enableBrowserTools.");
        }
        if (payload.browserTarget !== undefined) {
          const target = payload.browserTarget;
          if (
            !target
            || typeof target !== "object"
            || Array.isArray(target)
            || typeof target.windowId !== "string"
            || typeof target.tabId !== "string"
            || target.windowId.length === 0
            || target.tabId.length === 0
          ) {
            throw new TypeError("Invalid browserTarget.");
          }
          const allowedTargetKeys = ["windowId", "tabId"];
          for (const key of Object.keys(target)) {
            if (!allowedTargetKeys.includes(key)) {
              throw new TypeError(`Unknown browserTarget key: ${key}`);
            }
          }
          payload.browserTarget = Object.freeze({
            windowId: target.windowId,
            tabId: target.tabId,
          });
        }
        return payload;
      }
      case "cancel":
      case "getRun": {
        const payload = strictObject(value, ["runId"]);
        if (typeof payload.runId !== "string" || payload.runId.length === 0) {
          throw new TypeError("runId is required.");
        }
        return payload;
      }
      case "discoverModels":
      case "testConnection": {
        const payload = strictObject(value, ["providerId", "adapterId"]);
        return payload;
      }
      case "upsertRestProvider": {
        for (const key of FORBIDDEN_SECRET_KEYS) {
          if (Object.prototype.hasOwnProperty.call(value ?? {}, key)) {
            throw new TypeError(`Provider drafts must not include plaintext secret field "${key}".`);
          }
        }
        const payload = strictObject(value, REST_PROVIDER_KEYS);
        if (payload.kind !== "rest") throw new TypeError("upsertRestProvider requires kind \"rest\".");
        return payload;
      }
      case "upsertCliProvider": {
        for (const key of FORBIDDEN_SECRET_KEYS) {
          if (Object.prototype.hasOwnProperty.call(value ?? {}, key)) {
            throw new TypeError(`Provider drafts must not include plaintext secret field "${key}".`);
          }
        }
        const payload = strictObject(value, CLI_PROVIDER_KEYS);
        if (payload.kind !== "cli") throw new TypeError("upsertCliProvider requires kind \"cli\".");
        return payload;
      }
      case "setSessionApiKey": {
        const payload = strictObject(value, ["providerId", "apiKey"]);
        if (typeof payload.providerId !== "string" || payload.providerId.length === 0) {
          throw new TypeError("providerId is required.");
        }
        if (typeof payload.apiKey !== "string" || payload.apiKey.length === 0) {
          throw new TypeError("apiKey is required.");
        }
        return payload;
      }
      case "clearSessionApiKey":
      case "setActiveDefault": {
        const payload = strictObject(value, ["providerId"]);
        if (typeof payload.providerId !== "string" || payload.providerId.length === 0) {
          throw new TypeError("providerId is required.");
        }
        return payload;
      }
      case "rememberOnThisMac": {
        const payload = strictObject(value, ["providerId", "remember"]);
        if (typeof payload.providerId !== "string" || payload.providerId.length === 0) {
          throw new TypeError("providerId is required.");
        }
        if (typeof payload.remember !== "boolean") {
          throw new TypeError("remember must be a boolean.");
        }
        return payload;
      }
      default:
        throw new TypeError(`Unsupported Nia command: ${command}`);
    }
  }

  function projectProvidersSnapshot(snapshot) {
    return deepFreeze({
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
            // Never expose secretRef material beyond opaque presence.
            hasSecretRef: Boolean(provider.secretRef),
            hasSessionApiKey: typeof providerStore.getSessionApiKey === "function"
              ? Boolean(providerStore.getSessionApiKey(provider.id))
              : false,
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
    });
  }

  async function handleCommand(event, request) {
    const envelope = strictObject(request, ["command", "payload"]);
    if (!COMMAND_SET.has(envelope.command)) {
      throw new TypeError(`Unsupported Nia command: ${String(envelope.command)}`);
    }
    requireTrustedCaller(event);
    const sender = event.sender;
    if (!sender || typeof sender.id !== "number") {
      throw new NiaIpcError("UNTRUSTED_CALLER", "Missing sender webContents.");
    }
    const payload = parsePayload(envelope.command, envelope.payload);
    const ownerWebContentsId = sender.id;

    switch (envelope.command) {
      case "subscribe":
        return subscribe(sender);
      case "unsubscribe":
        return unsubscribe(sender);
      case "start":
        attachLifecycle(sender);
        return runtime.startRun({
          ownerWebContentsId,
          providerId: payload.providerId ?? null,
          modelOverride: payload.modelOverride ?? null,
          prompt: payload.prompt,
          enableBrowserTools: payload.enableBrowserTools === true,
          browserTarget: payload.browserTarget ?? null,
        });
      case "cancel":
        return runtime.cancelRun({
          runId: payload.runId,
          ownerWebContentsId,
        });
      case "getRun":
        return runtime.getRun({
          runId: payload.runId,
          ownerWebContentsId,
        });
      case "listProviders": {
        if (!providerStore) return deepFreeze({ activeProviderId: null, providers: [] });
        const snapshot = await providerStore.readPersistedConfig();
        return projectProvidersSnapshot(snapshot);
      }
      case "upsertRestProvider": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        await providerStore.upsertRestProvider(payload);
        return projectProvidersSnapshot(await providerStore.readPersistedConfig());
      }
      case "upsertCliProvider": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        await providerStore.upsertCliProvider(payload);
        return projectProvidersSnapshot(await providerStore.readPersistedConfig());
      }
      case "setSessionApiKey": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        providerStore.setSessionApiKey(payload.providerId, payload.apiKey);
        return true;
      }
      case "clearSessionApiKey": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        providerStore.clearSessionApiKey(payload.providerId);
        return true;
      }
      case "setActiveDefault": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        await providerStore.setActiveDefault(payload.providerId);
        return projectProvidersSnapshot(await providerStore.readPersistedConfig());
      }
      case "rememberOnThisMac": {
        if (!providerStore) throw new TypeError("Nia provider store is unavailable.");
        await providerStore.rememberOnThisMac(payload.providerId, payload.remember);
        return projectProvidersSnapshot(await providerStore.readPersistedConfig());
      }
      case "discoverModels": {
        if (payload.adapterId) {
          return runtime.modelDiscovery.discoverCli({ adapterId: payload.adapterId });
        }
        if (!payload.providerId || !providerStore) {
          throw new TypeError("providerId or adapterId is required.");
        }
        const provider = await providerStore.getProvider(payload.providerId);
        if (!provider) throw new TypeError("Provider not found.");
        if (provider.kind === "cli") {
          return runtime.modelDiscovery.discoverCli({ adapterId: provider.adapterId });
        }
        const apiKey = await providerStore.resolveRuntimeApiKey(provider.id);
        return runtime.modelDiscovery.discoverRestModels({ provider, apiKey });
      }
      case "testConnection": {
        if (payload.adapterId) {
          return runtime.modelDiscovery.testCliConnection({ adapterId: payload.adapterId });
        }
        if (!payload.providerId || !providerStore) {
          throw new TypeError("providerId or adapterId is required.");
        }
        const provider = await providerStore.getProvider(payload.providerId);
        if (!provider) throw new TypeError("Provider not found.");
        if (provider.kind === "cli") {
          return runtime.modelDiscovery.testCliConnection({ adapterId: provider.adapterId });
        }
        const apiKey = await providerStore.resolveRuntimeApiKey(provider.id);
        return runtime.modelDiscovery.testRestConnection({ provider, apiKey });
      }
      default:
        throw new TypeError(`Unsupported Nia command: ${envelope.command}`);
    }
  }

  function register() {
    if (registered) return false;
    registered = true;
    ipcMain.handle(NIA_COMMAND_CHANNEL, handleCommand);
    return true;
  }

  function dispose() {
    if (registered) ipcMain.removeHandler(NIA_COMMAND_CHANNEL);
    registered = false;
    for (const webContents of [...subscribers.keys()]) {
      runtime.cancelAllForOwner(webContents.id);
      unsubscribe(webContents);
    }
    for (const webContents of [...destroyHandlers.keys()]) {
      detachLifecycle(webContents);
    }
  }

  return Object.freeze({
    dispose,
    register,
    subscribe,
    unsubscribe,
    handleCommand,
  });
}

module.exports = {
  NIA_CALLER_KINDS,
  NIA_COMMAND_CHANNEL,
  NIA_EVENT_CHANNEL,
  NIA_IPC_COMMANDS,
  NiaIpcError,
  createNiaIpc,
};
