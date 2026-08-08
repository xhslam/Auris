"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNiaBridge, type NiaProviderEvent, type NiaProvidersSnapshot } from "@/features/nia/nia-bridge";
import { formatNiaContextForPrompt, type NiaContext } from "@/features/nia/nia-context";
import {
  appendNiaHistory,
  isNiaHistoryEnabled,
  loadNiaHistory,
  setNiaHistoryEnabled,
  type NiaHistoryRecord,
} from "@/features/nia/nia-history";
import type { NiaCliAdapterId, NiaRestProtocol } from "@/features/nia/provider-contract";

export type NiaProviderSummary = Readonly<{
  id: string;
  label: string;
  kind: "rest" | "cli";
  enabled: boolean;
  defaultModel: string;
  supportedModels: readonly string[];
  protocol?: NiaRestProtocol;
  endpoint?: string;
  adapterId?: NiaCliAdapterId;
  rememberOnThisMac?: boolean;
  hasSecretRef?: boolean;
  hasSessionApiKey?: boolean;
  capabilities?: Readonly<Record<string, unknown>>;
}>;

export type NiaMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  content: string;
}>;

export type NiaRestProviderDraft = Readonly<{
  id: string;
  protocol: NiaRestProtocol;
  label: string;
  endpoint: string;
  defaultModel: string;
  supportedModels?: readonly string[];
  enabled?: boolean;
}>;

export type NiaCliProviderDraft = Readonly<{
  id: string;
  adapterId: NiaCliAdapterId;
  label: string;
  defaultModel: string;
  supportedModels?: readonly string[];
  enabled?: boolean;
}>;

const DEFAULT_REST_CAPABILITIES = Object.freeze({
  streaming: true,
  toolModeDisable: true,
  cancellation: true,
  attachments: false,
  maxInputTokens: 128_000,
  maxOutputTokens: 8_192,
});

const DEFAULT_CLI_CAPABILITIES = Object.freeze({
  ...DEFAULT_REST_CAPABILITIES,
  independentToolAuthority: false,
});

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localStorageOrNull() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function applyProvidersSnapshot(
  value: NiaProvidersSnapshot | unknown,
  setProviders: (providers: NiaProviderSummary[]) => void,
  setProviderId: (id: string | null) => void,
  setModel: (model: string | null) => void,
  preferredProviderId?: string | null,
) {
  if (!value || typeof value !== "object") return;
  const snapshot = value as { activeProviderId?: string | null; providers?: NiaProviderSummary[] };
  const nextProviders = Array.isArray(snapshot.providers)
    ? snapshot.providers.filter((provider) => provider?.enabled !== false)
    : [];
  setProviders(nextProviders);
  const nextProviderId =
    preferredProviderId && nextProviders.some((provider) => provider.id === preferredProviderId)
      ? preferredProviderId
      : snapshot.activeProviderId ?? nextProviders[0]?.id ?? null;
  setProviderId(nextProviderId);
  const selected = nextProviders.find((provider) => provider.id === nextProviderId);
  setModel(selected?.defaultModel ?? null);
}

export function useNiaSession(host: unknown = typeof window === "undefined" ? globalThis : window) {
  const bridge = useMemo(() => getNiaBridge(host), [host]);
  const [providers, setProviders] = useState<NiaProviderSummary[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [messages, setMessages] = useState<NiaMessage[]>([]);
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "completed" | "failed" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [historyEnabled, setHistoryEnabledState] = useState(false);
  const [history, setHistory] = useState<NiaHistoryRecord[]>([]);
  const runIdRef = useRef<string | null>(null);
  const pendingStartRef = useRef(false);
  const responseRef = useRef("");
  const providerIdRef = useRef<string | null>(null);
  const modelRef = useRef<string | null>(null);
  const lastRequestRef = useRef<{ prompt: string; context: NiaContext | null } | null>(null);

  useEffect(() => {
    const storage = localStorageOrNull();
    setHistoryEnabledState(isNiaHistoryEnabled(storage));
    setHistory(loadNiaHistory(storage));
  }, []);

  const refreshProviders = useCallback(async (preferredProviderId?: string | null) => {
    if (!bridge) return null;
    const snapshot = await bridge.listProviders();
    applyProvidersSnapshot(snapshot, setProviders, setProviderId, setModel, preferredProviderId);
    return snapshot;
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.listProviders().then((value) => {
      if (!active) return;
      applyProvidersSnapshot(value, setProviders, setProviderId, setModel);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load Nia providers.");
    });
    return () => { active = false; };
  }, [bridge]);

  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const lastBrowserOptionsRef = useRef<{
    enableBrowserTools?: boolean;
    browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
  }>({});

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.subscribe((event: NiaProviderEvent) => {
      if (event.type === "started" && pendingStartRef.current && !runIdRef.current) {
        runIdRef.current = event.runId;
      }
      if (!runIdRef.current || event.runId !== runIdRef.current) return;
      if (event.type === "delta" && event.text) {
        responseRef.current += event.text;
        setResponse(responseRef.current);
        return;
      }
      if (event.type === "tool") {
        const label = event.action || event.name || "browser";
        setToolStatus(
          event.status === "started"
            ? `Browser · ${label}…`
            : event.status === "failed"
              ? `Browser · ${label} failed`
              : `Browser · ${label} ok`,
        );
        return;
      }
      if (event.type === "completed") {
        const finalText = event.text ?? responseRef.current;
        responseRef.current = finalText;
        setResponse(finalText);
        setMessages((current) => [
          ...current,
          { id: id("assistant"), role: "assistant", content: finalText },
        ]);
        setStatus("completed");
        setToolStatus(null);
        const request = lastRequestRef.current;
        if (request) {
          const storage = localStorageOrNull();
          const records = appendNiaHistory(storage, {
            id: id("history"),
            createdAt: new Date().toISOString(),
            prompt: request.prompt,
            response: finalText,
            ...(providerIdRef.current ? { providerId: providerIdRef.current } : {}),
            ...(modelRef.current ? { model: modelRef.current } : {}),
          });
          setHistory(records);
        }
        return;
      }
      if (event.type === "failed") {
        setStatus("failed");
        setToolStatus(null);
        setError(event.message || event.code || "Nia provider failed.");
        return;
      }
      if (event.type === "cancelled") {
        setToolStatus(null);
        setStatus("cancelled");
      }
    });
    return () => { unsubscribe(); };
  }, [bridge]);

  useEffect(() => {
    providerIdRef.current = providerId;
    modelRef.current = model;
  }, [model, providerId]);

  const submit = useCallback(async (
    prompt: string,
    context: NiaContext | null = null,
    options: {
      enableBrowserTools?: boolean;
      browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
    } = {},
  ) => {
    const trimmed = prompt.trim();
    if (!bridge || !trimmed || status === "streaming") return false;
    setError(null);
    setToolStatus(null);
    setResponse("");
    responseRef.current = "";
    lastRequestRef.current = { prompt: trimmed, context };
    lastBrowserOptionsRef.current = {
      enableBrowserTools: options.enableBrowserTools === true,
      browserTarget: options.browserTarget ?? null,
    };
    setMessages((current) => [...current, { id: id("user"), role: "user", content: trimmed }]);
    setStatus("streaming");
    pendingStartRef.current = true;
    runIdRef.current = null;
    const wirePrompt = context
      ? `${trimmed}\n\n---\n${formatNiaContextForPrompt(context)}`
      : trimmed;
    try {
      const started = await bridge.start({
        prompt: wirePrompt,
        ...(providerId ? { providerId } : {}),
        ...(model ? { modelOverride: model } : {}),
        ...(options.enableBrowserTools === true ? { enableBrowserTools: true } : {}),
        ...(options.browserTarget
          ? { browserTarget: options.browserTarget }
          : {}),
      });
      runIdRef.current = started.runId;
      pendingStartRef.current = false;
      return true;
    } catch (cause) {
      pendingStartRef.current = false;
      setStatus("failed");
      setError(cause instanceof Error ? cause.message : "Unable to start Nia.");
      return false;
    }
  }, [bridge, model, providerId, status]);

  const stop = useCallback(async () => {
    if (!bridge || !runIdRef.current) return false;
    await bridge.cancel({ runId: runIdRef.current });
    setToolStatus(null);
    setStatus("cancelled");
    return true;
  }, [bridge]);

  const retry = useCallback(async () => {
    const last = lastRequestRef.current;
    if (!last) return false;
    return submit(last.prompt, last.context, lastBrowserOptionsRef.current);
  }, [submit]);

  const selectProvider = useCallback((nextId: string) => {
    setProviderId(nextId);
    const selected = providers.find((provider) => provider.id === nextId);
    setModel(selected?.defaultModel ?? null);
    if (!bridge || !nextId) return;
    void bridge.setActiveDefault({ providerId: nextId }).then((snapshot) => {
      applyProvidersSnapshot(snapshot, setProviders, setProviderId, setModel, nextId);
    }).catch(() => {
      // Selection still works locally if persistence fails.
    });
  }, [bridge, providers]);

  const setHistoryEnabled = useCallback((enabled: boolean) => {
    const storage = localStorageOrNull();
    setNiaHistoryEnabled(storage, enabled);
    setHistoryEnabledState(enabled);
    setHistory(enabled ? loadNiaHistory(storage) : []);
  }, []);

  const upsertRestProvider = useCallback(async (
    draft: NiaRestProviderDraft,
    options: { apiKey?: string; rememberOnThisMac?: boolean } = {},
  ) => {
    if (!bridge) return false;
    setConfigMessage(null);
    setError(null);
    const models = draft.supportedModels?.length
      ? [...draft.supportedModels]
      : [draft.defaultModel];
    try {
      const snapshot = await bridge.upsertRestProvider({
        id: draft.id,
        kind: "rest",
        protocol: draft.protocol,
        label: draft.label,
        enabled: draft.enabled !== false,
        endpoint: draft.endpoint,
        defaultModel: draft.defaultModel,
        supportedModels: models,
        capabilities: DEFAULT_REST_CAPABILITIES,
        bounds: {
          timeoutMs: 60_000,
          maxOutputBytes: 1_048_576,
        },
      });
      if (options.apiKey) {
        await bridge.setSessionApiKey({ providerId: draft.id, apiKey: options.apiKey });
      }
      if (options.rememberOnThisMac === true) {
        await bridge.rememberOnThisMac({ providerId: draft.id, remember: true });
      } else if (options.rememberOnThisMac === false) {
        await bridge.rememberOnThisMac({ providerId: draft.id, remember: false });
      }
      const refreshed = options.apiKey || options.rememberOnThisMac !== undefined
        ? await bridge.listProviders()
        : snapshot;
      applyProvidersSnapshot(refreshed, setProviders, setProviderId, setModel, draft.id);
      setConfigMessage("Provider saved · 已保存");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save provider.");
      return false;
    }
  }, [bridge]);

  const upsertCliProvider = useCallback(async (draft: NiaCliProviderDraft) => {
    if (!bridge) return false;
    setConfigMessage(null);
    setError(null);
    const models = draft.supportedModels?.length
      ? [...draft.supportedModels]
      : [draft.defaultModel];
    try {
      const snapshot = await bridge.upsertCliProvider({
        id: draft.id,
        kind: "cli",
        adapterId: draft.adapterId,
        label: draft.label,
        enabled: draft.enabled !== false,
        defaultModel: draft.defaultModel,
        supportedModels: models,
        capabilities: DEFAULT_CLI_CAPABILITIES,
        bounds: {
          timeoutMs: 60_000,
          maxOutputBytes: 1_048_576,
        },
      });
      applyProvidersSnapshot(snapshot, setProviders, setProviderId, setModel, draft.id);
      setConfigMessage("CLI provider saved · 已保存");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save CLI provider.");
      return false;
    }
  }, [bridge]);

  const setSessionApiKey = useCallback(async (nextProviderId: string, apiKey: string) => {
    if (!bridge) return false;
    setConfigMessage(null);
    setError(null);
    try {
      await bridge.setSessionApiKey({ providerId: nextProviderId, apiKey });
      await refreshProviders(nextProviderId);
      setConfigMessage("API key stored in memory · 密钥已写入内存");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to store API key.");
      return false;
    }
  }, [bridge, refreshProviders]);

  const rememberOnThisMac = useCallback(async (nextProviderId: string, remember: boolean) => {
    if (!bridge) return false;
    setConfigMessage(null);
    setError(null);
    try {
      const snapshot = await bridge.rememberOnThisMac({ providerId: nextProviderId, remember });
      applyProvidersSnapshot(snapshot, setProviders, setProviderId, setModel, nextProviderId);
      setConfigMessage(remember
        ? "Remembered on this Mac · 已记住"
        : "Keychain remember cleared · 已清除");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update Keychain remember.");
      return false;
    }
  }, [bridge]);

  const testConnection = useCallback(async (target?: {
    providerId?: string;
    adapterId?: string;
  }) => {
    if (!bridge) return false;
    setConfigMessage(null);
    setError(null);
    try {
      await bridge.testConnection({
        ...(target?.providerId ? { providerId: target.providerId } : providerId ? { providerId } : {}),
        ...(target?.adapterId ? { adapterId: target.adapterId } : {}),
      });
      setConfigMessage("Connection ok · 连接正常");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection test failed.");
      return false;
    }
  }, [bridge, providerId]);

  return {
    available: Boolean(bridge),
    configMessage,
    error,
    history,
    historyEnabled,
    messages,
    model,
    providerId,
    providers,
    refreshProviders,
    rememberOnThisMac,
    response,
    retry,
    selectProvider,
    setHistoryEnabled,
    setModel,
    setSessionApiKey,
    status,
    stop,
    submit,
    testConnection,
    toolStatus,
    upsertCliProvider,
    upsertRestProvider,
  };
}
