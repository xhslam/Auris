"use client";

import { useMemo, useState } from "react";
import {
  NIA_CLI_ADAPTER_IDS,
  NIA_REST_PROTOCOLS,
  type NiaCliAdapterId,
  type NiaRestProtocol,
} from "@/features/nia/provider-contract";
import type {
  NiaCliProviderDraft,
  NiaProviderSummary,
  NiaRestProviderDraft,
} from "@/features/nia/use-nia-session";

const PROTOCOL_ENDPOINTS: Record<NiaRestProtocol, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  "openai-compatible": "https://api.openai.com/v1",
  "google-ai": "https://generativelanguage.googleapis.com",
  ollama: "http://127.0.0.1:11434",
};

const PROTOCOL_MODELS: Record<NiaRestProtocol, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  "openai-compatible": "gpt-4o",
  "google-ai": "gemini-2.0-flash",
  ollama: "llama3.2",
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "provider";
}

export function NiaProviderSettings({
  configMessage = null,
  defaultOpen,
  historyEnabled,
  model,
  onHistoryEnabledChange,
  onModelChange,
  onProviderChange,
  onRememberOnThisMac,
  onSaveCliProvider,
  onSaveRestProvider,
  onSetSessionApiKey,
  onTestConnection,
  providerId,
  providers,
  summary = "模型设置",
}: {
  configMessage?: string | null;
  defaultOpen?: boolean;
  historyEnabled: boolean;
  model: string | null;
  onHistoryEnabledChange: (enabled: boolean) => void;
  onModelChange: (model: string) => void;
  onProviderChange: (providerId: string) => void;
  onRememberOnThisMac?: (providerId: string, remember: boolean) => void | Promise<boolean>;
  onSaveCliProvider?: (draft: NiaCliProviderDraft) => void | Promise<boolean>;
  onSaveRestProvider?: (
    draft: NiaRestProviderDraft,
    options: { apiKey?: string; rememberOnThisMac?: boolean },
  ) => void | Promise<boolean>;
  onSetSessionApiKey?: (providerId: string, apiKey: string) => void | Promise<boolean>;
  onTestConnection?: (target?: {
    providerId?: string;
    adapterId?: string;
  }) => void | Promise<boolean>;
  providerId: string | null;
  providers: readonly NiaProviderSummary[];
  summary?: string;
}) {
  const provider = providers.find((entry) => entry.id === providerId) ?? null;
  const models = provider?.supportedModels?.length
    ? provider.supportedModels
    : provider?.defaultModel
      ? [provider.defaultModel]
      : [];
  const openByDefault = defaultOpen ?? providers.length === 0;
  const [kind, setKind] = useState<"rest" | "cli">("rest");
  const [protocol, setProtocol] = useState<NiaRestProtocol>("anthropic");
  const [adapterId, setAdapterId] = useState<NiaCliAdapterId>("claude");
  const [label, setLabel] = useState("Anthropic");
  const [endpoint, setEndpoint] = useState(PROTOCOL_ENDPOINTS.anthropic);
  const [defaultModel, setDefaultModel] = useState(PROTOCOL_MODELS.anthropic);
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [sessionKeyDraft, setSessionKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const canConfigure = Boolean(onSaveRestProvider || onSaveCliProvider);
  const draftId = useMemo(() => {
    if (kind === "cli") return `${adapterId}-cli`;
    return `${slugify(label)}-${protocol}`;
  }, [adapterId, kind, label, protocol]);

  const applyProtocolDefaults = (next: NiaRestProtocol) => {
    setProtocol(next);
    setEndpoint(PROTOCOL_ENDPOINTS[next]);
    setDefaultModel(PROTOCOL_MODELS[next]);
    setLabel(next === "openai-compatible" ? "OpenAI Compatible" : next);
  };

  const saveDraft = async () => {
    if (!canConfigure || saving) return;
    setSaving(true);
    try {
      if (kind === "rest" && onSaveRestProvider) {
        const draft: NiaRestProviderDraft = {
          id: draftId,
          protocol,
          label: label.trim() || draftId,
          endpoint: endpoint.trim(),
          defaultModel: defaultModel.trim(),
          supportedModels: [defaultModel.trim()],
          enabled: true,
        };
        await onSaveRestProvider(draft, {
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          rememberOnThisMac: remember,
        });
        setApiKey("");
        return;
      }
      if (kind === "cli" && onSaveCliProvider) {
        const draft: NiaCliProviderDraft = {
          id: draftId,
          adapterId,
          label: label.trim() || `${adapterId} CLI`,
          defaultModel: defaultModel.trim(),
          supportedModels: [defaultModel.trim()],
          enabled: true,
        };
        await onSaveCliProvider(draft);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="nia-provider-settings" open={openByDefault || undefined}>
      <summary>{summary}</summary>
      <label>
        提供商
        <select
          aria-label="Nia provider"
          onChange={(event) => onProviderChange(event.target.value)}
          value={providerId ?? ""}
        >
          {providers.length === 0 ? <option value="">尚未配置提供商</option> : null}
          {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
      </label>
      <label>
        模型
        <select
          aria-label="Nia model"
          disabled={models.length === 0}
          onChange={(event) => onModelChange(event.target.value)}
          value={model ?? ""}
        >
          {models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
      </label>
      {provider ? (
        <div className="nia-provider-settings__actions">
          <button
            disabled={!onTestConnection}
            onClick={() => void onTestConnection?.(
              provider.kind === "cli" && provider.adapterId
                ? { adapterId: provider.adapterId }
                : { providerId: provider.id },
            )}
            type="button"
          >
            测试连接
          </button>
          {provider.kind === "rest" && onSetSessionApiKey ? (
            <label>
              临时 API Key
              <input
                aria-label="Nia session API key"
                autoComplete="off"
                onChange={(event) => setSessionKeyDraft(event.target.value)}
                placeholder="sk-…"
                type="password"
                value={sessionKeyDraft}
              />
              <button
                disabled={!sessionKeyDraft.trim()}
                onClick={() => {
                  void Promise.resolve(
                    onSetSessionApiKey(provider.id, sessionKeyDraft.trim()),
                  ).then((ok) => {
                    if (ok !== false) setSessionKeyDraft("");
                  });
                }}
                type="button"
              >
                保存临时密钥
              </button>
            </label>
          ) : null}
          {provider.kind === "rest" && onRememberOnThisMac ? (
            <label>
              <input
                checked={provider.rememberOnThisMac === true}
                onChange={(event) => void onRememberOnThisMac(provider.id, event.target.checked)}
                type="checkbox"
              />
              记住在这台 Mac 上
            </label>
          ) : null}
          {provider.hasSecretRef || provider.hasSessionApiKey ? (
            <p role="status">
              {provider.hasSessionApiKey ? "临时密钥已就绪" : null}
              {provider.hasSessionApiKey && provider.hasSecretRef ? " · " : null}
              {provider.hasSecretRef ? "已安全保存在钥匙串" : null}
            </p>
          ) : null}
        </div>
      ) : null}
      <label>
        <input
          checked={historyEnabled}
          onChange={(event) => onHistoryEnabledChange(event.target.checked)}
          type="checkbox"
        />
        保存文字模型本地历史
      </label>
      {provider?.capabilities?.independentToolAuthority === true ? (
        <p role="status">此提供商可能拥有独立的工具调用权限。</p>
      ) : null}
      {canConfigure ? (
        <fieldset className="nia-provider-settings__draft">
          <legend>添加提供商</legend>
          <label>
            类型
            <select
              aria-label="Nia provider kind"
              onChange={(event) => setKind(event.target.value as "rest" | "cli")}
              value={kind}
            >
              <option value="rest">REST</option>
              <option value="cli">CLI</option>
            </select>
          </label>
          {kind === "rest" ? (
            <label>
              协议
              <select
                aria-label="Nia REST protocol"
                onChange={(event) => applyProtocolDefaults(event.target.value as NiaRestProtocol)}
                value={protocol}
              >
                {NIA_REST_PROTOCOLS.map((entry) => (
                  <option key={entry} value={entry}>{entry}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              适配器
              <select
                aria-label="Nia CLI adapter"
                onChange={(event) => {
                  const next = event.target.value as NiaCliAdapterId;
                  setAdapterId(next);
                  setLabel(`${next} CLI`);
                  setDefaultModel(PROTOCOL_MODELS.anthropic);
                }}
                value={adapterId}
              >
                {NIA_CLI_ADAPTER_IDS.map((entry) => (
                  <option key={entry} value={entry}>{entry}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            名称
            <input
              aria-label="Nia provider label"
              onChange={(event) => setLabel(event.target.value)}
              value={label}
            />
          </label>
          {kind === "rest" ? (
            <label>
              接口地址
              <input
                aria-label="Nia provider endpoint"
                onChange={(event) => setEndpoint(event.target.value)}
                value={endpoint}
              />
            </label>
          ) : null}
          <label>
            默认模型
            <input
              aria-label="Nia provider default model"
              onChange={(event) => setDefaultModel(event.target.value)}
              value={defaultModel}
            />
          </label>
          {kind === "rest" ? (
            <>
              <label>
                API Key
                <input
                  aria-label="Nia provider API key"
                  autoComplete="off"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="可选"
                  type="password"
                  value={apiKey}
                />
              </label>
              <label>
                <input
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  type="checkbox"
                />
                记住在这台 Mac 上
              </label>
            </>
          ) : null}
          <button disabled={saving || !label.trim() || !defaultModel.trim()} onClick={() => void saveDraft()} type="button">
            {saving ? "正在保存…" : "保存"}
          </button>
        </fieldset>
      ) : null}
      {configMessage ? <p aria-live="polite">{configMessage}</p> : null}
    </details>
  );
}
