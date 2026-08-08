/**
 * Renderer-safe Nia provider bridge.
 *
 * Talks only through the narrow preload allowlist. Never accepts or sends
 * owner/webContents identity — main binds runs to the trusted sender.
 */

export const NIA_BRIDGE_COMMANDS = [
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
  "listDefinitions",
  "getDefinition",
] as const;

export type NiaBridgeCommand = (typeof NIA_BRIDGE_COMMANDS)[number];

export type NiaProviderEventType =
  | "started"
  | "delta"
  | "tool"
  | "completed"
  | "failed"
  | "cancelled";

export type NiaProviderEvent = Readonly<{
  type: NiaProviderEventType;
  runId: string;
  text?: string;
  code?: string;
  message?: string;
  providerId?: string;
  model?: string;
  ownerWebContentsId?: number;
  enableBrowserTools?: boolean;
  name?: string;
  action?: string | null;
  status?: string;
  summary?: string;
}>;

export type NiaNativeBridge = {
  invoke(command: NiaBridgeCommand, payload?: Readonly<Record<string, unknown>>): Promise<unknown>;
  subscribe(listener: (event: NiaProviderEvent) => void): boolean;
  unsubscribe(listener: (event: NiaProviderEvent) => void): boolean;
};

export type NiaStartResult = Readonly<{
  runId: string;
  providerId: string;
  model: string;
  ownerWebContentsId: number;
}>;

export type NiaProvidersSnapshot = Readonly<{
  activeProviderId: string | null;
  providers: readonly Readonly<Record<string, unknown>>[];
}>;

/**
 * 定义列表条目：不含 `body`。
 *
 * 主进程按白名单投影（见 `nia-ipc.cjs#projectDefinitionSummary`），所以列表
 * 一次 IPC 的体积与定义正文无关——单个定义的 body 上限是 200KB，全量带上会让
 * 打开选择器变成一次几 MB 的结构化克隆。要正文时用 `getDefinition`。
 */
export type NiaDefinitionSummary = Readonly<{
  action?: string;
  approval?: string;
  canonicalId: string;
  category?: string;
  context?: number;
  description: string;
  label: "Nia";
  model?: string;
  provenance: "built-in" | "installed";
  scope: string;
  sourceCompatibility: string;
  tags?: readonly string[];
}>;

export type NiaDefinitionsSnapshot = Readonly<{
  definitions: readonly NiaDefinitionSummary[];
}>;

export function createNiaBridge(native: NiaNativeBridge) {
  const invoke = (command: NiaBridgeCommand, payload: Readonly<Record<string, unknown>> = {}) =>
    native.invoke(command, payload);

  return Object.freeze({
    cancel: (payload: { runId: string }) => invoke("cancel", payload),
    clearSessionApiKey: (payload: { providerId: string }) =>
      invoke("clearSessionApiKey", payload),
    discoverModels: (payload: { providerId?: string; adapterId?: string }) =>
      invoke("discoverModels", payload),
    /**
     * 取一条定义的完整记录（含 `body`）。
     *
     * 定义不存在时返回 `null` 而不是抛错：列表可能已经过期（另一个渲染器刚卸载
     * 了一条定义），调用方要处理的是「这条没了」而不是一个异常。
     */
    getDefinition: (payload: { canonicalId: string }) =>
      invoke("getDefinition", payload) as Promise<Readonly<Record<string, unknown>> | null>,
    getRun: (payload: { runId: string }) => invoke("getRun", payload),
    listDefinitions: () => invoke("listDefinitions") as Promise<NiaDefinitionsSnapshot>,
    listProviders: () => invoke("listProviders") as Promise<NiaProvidersSnapshot>,
    rememberOnThisMac: (payload: { providerId: string; remember: boolean }) =>
      invoke("rememberOnThisMac", payload) as Promise<NiaProvidersSnapshot>,
    setActiveDefault: (payload: { providerId: string }) =>
      invoke("setActiveDefault", payload) as Promise<NiaProvidersSnapshot>,
    setSessionApiKey: (payload: { providerId: string; apiKey: string }) =>
      invoke("setSessionApiKey", payload),
    start: (payload: {
      prompt: string;
      providerId?: string;
      modelOverride?: string;
      enableBrowserTools?: boolean;
      browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
    }) => invoke("start", {
      prompt: payload.prompt,
      ...(payload.providerId ? { providerId: payload.providerId } : {}),
      ...(payload.modelOverride ? { modelOverride: payload.modelOverride } : {}),
      ...(payload.enableBrowserTools === true ? { enableBrowserTools: true } : {}),
      ...(payload.browserTarget
        ? {
            browserTarget: {
              windowId: payload.browserTarget.windowId,
              tabId: payload.browserTarget.tabId,
            },
          }
        : {}),
    }) as Promise<NiaStartResult>,
    testConnection: (payload: { providerId?: string; adapterId?: string }) =>
      invoke("testConnection", payload),
    upsertCliProvider: (payload: Readonly<Record<string, unknown>>) =>
      invoke("upsertCliProvider", payload) as Promise<NiaProvidersSnapshot>,
    upsertRestProvider: (payload: Readonly<Record<string, unknown>>) =>
      invoke("upsertRestProvider", payload) as Promise<NiaProvidersSnapshot>,
    subscribe(listener: (event: NiaProviderEvent) => void) {
      native.subscribe(listener);
      return () => native.unsubscribe(listener);
    },
  });
}

export function getNiaBridge(host: unknown = globalThis): ReturnType<typeof createNiaBridge> | null {
  const record = host as {
    aurisNia?: Partial<NiaNativeBridge>;
    shadowingDesktop?: { nia?: Partial<NiaNativeBridge> };
  } | null;

  const native = record?.aurisNia ?? record?.shadowingDesktop?.nia;
  if (
    !native ||
    typeof native.invoke !== "function" ||
    typeof native.subscribe !== "function" ||
    typeof native.unsubscribe !== "function"
  ) {
    return null;
  }
  return createNiaBridge(native as NiaNativeBridge);
}

declare global {
  interface Window {
    aurisNia?: NiaNativeBridge;
  }
}
