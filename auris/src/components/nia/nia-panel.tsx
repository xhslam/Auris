"use client";

import { useState } from "react";
import { NiaApplyReview } from "@/components/nia/nia-apply-review";
import { NiaComposer } from "@/components/nia/nia-composer";
import { NiaProviderSettings } from "@/components/nia/nia-provider-settings";
import { NiaResponse } from "@/components/nia/nia-response";
import { WorkflowRecorderPanel } from "@/components/nia/workflow-recorder-panel";
import { WorkflowHealReview } from "@/components/nia/workflow-heal-review";
import { WorkflowLibrary } from "@/components/nia/workflow-library";
import type { WorkflowHealProposal } from "@/features/workflows/workflow-self-heal";
import type {
  NiaApplyProposal,
  NiaContext,
  NiaDocumentContext,
  NiaSelectionContext,
} from "@/features/nia/nia-context";
import { useNiaSession } from "@/features/nia/use-nia-session";

export type NiaContextRequest = "selection" | "document" | "browser";

export function NiaPanel({
  host = typeof window === "undefined" ? globalThis : window,
  onApplyProposal,
  onRequestContext,
  supportedContexts = [],
  healProposal = null,
  onAcceptHeal,
  onRejectHeal,
  browserTarget = null,
}: {
  host?: unknown;
  onApplyProposal?: (proposal: NiaApplyProposal) => { ok: boolean; reason?: string } | void;
  onRequestContext?: (kind: NiaContextRequest) => NiaContext | null;
  supportedContexts?: readonly NiaContextRequest[];
  healProposal?: WorkflowHealProposal | null;
  onAcceptHeal?: (candidateIndex: number) => void;
  onRejectHeal?: () => void;
  browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
}) {
  const session = useNiaSession(host);
  const [context, setContext] = useState<NiaContext | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [enableBrowserTools, setEnableBrowserTools] = useState(false);
  const [recordedSource, setRecordedSource] = useState<string | null>(null);
  const selectedHistory = session.history.find((record) => record.id === selectedHistoryId) ?? null;
  const displayedResponse = selectedHistory?.response ?? session.response;
  const noteContext = context?.kind === "notes_selection" || context?.kind === "notes_document"
    ? context as NiaSelectionContext | NiaDocumentContext
    : null;
  const browserToolsAvailable = supportedContexts.includes("browser");

  const contextLabels: Record<NiaContextRequest, string> = {
    selection: "Attach selection · 选区",
    document: "Attach document · 文档",
    browser: "Attach browser · 页面",
  };

  return (
    <aside aria-label="Nia assistant" className="nia-panel">
      <header className="nia-panel__header">
        <div>
          <span className="nia-panel__eyebrow">Assistant · 助手</span>
          <strong>Nia</strong>
          <span className="nia-panel__subtitle">Built-in writing partner</span>
        </div>
        <span aria-live="polite">{session.status}</span>
      </header>
      <NiaProviderSettings
        configMessage={session.configMessage}
        historyEnabled={session.historyEnabled}
        model={session.model}
        onHistoryEnabledChange={session.setHistoryEnabled}
        onModelChange={session.setModel}
        onProviderChange={session.selectProvider}
        onRememberOnThisMac={session.rememberOnThisMac}
        onSaveCliProvider={session.upsertCliProvider}
        onSaveRestProvider={session.upsertRestProvider}
        onSetSessionApiKey={session.setSessionApiKey}
        onTestConnection={session.testConnection}
        providerId={session.providerId}
        providers={session.providers}
      />
      {supportedContexts.length > 0 ? (
        <div aria-label="Nia context" className="nia-panel__context">
          {supportedContexts.map((kind) => (
            <button
              key={kind}
              onClick={() => setContext(onRequestContext?.(kind) ?? null)}
              type="button"
            >{contextLabels[kind]}</button>
          ))}
          {context ? <button onClick={() => setContext(null)} type="button">Remove · 清除</button> : null}
          <span>{context ? `${context.provenance} attached` : "No implicit context · 无隐式上下文"}</span>
        </div>
      ) : null}
      {browserToolsAvailable ? (
        <label className="nia-panel__browser-tools">
          <input
            checked={enableBrowserTools}
            disabled={!session.available || session.status === "streaming"}
            onChange={(event) => setEnableBrowserTools(event.target.checked)}
            type="checkbox"
          />
          <span>Allow browser automation · 允许浏览操作</span>
        </label>
      ) : null}
      {session.toolStatus ? (
        <p aria-live="polite" className="nia-panel__tool-status">{session.toolStatus}</p>
      ) : null}
      <NiaComposer
        disabled={!session.available || session.providers.length === 0}
        isStreaming={session.status === "streaming"}
        onStop={() => void session.stop()}
        onSubmit={(prompt) => {
          setSelectedHistoryId(null);
          void session.submit(prompt, context, {
            enableBrowserTools: browserToolsAvailable && enableBrowserTools,
            browserTarget: browserToolsAvailable && enableBrowserTools ? browserTarget : null,
          });
        }}
      />
      {!session.available ? (
        <p aria-live="polite">Nia bridge unavailable in this window · 当前窗口桥接不可用</p>
      ) : session.providers.length === 0 ? (
        <p aria-live="polite">Configure a provider above to start · 请先在上方配置模型</p>
      ) : null}
      {session.error ? <p role="alert">{session.error}</p> : null}
      <NiaResponse content={displayedResponse} />
      <div className="nia-panel__response-actions">
        <button disabled={!displayedResponse} onClick={() => void navigator.clipboard?.writeText(displayedResponse)} type="button">Copy · 复制</button>
        <button disabled={!session.response} onClick={() => void session.retry()} type="button">Retry · 重试</button>
        {noteContext && onApplyProposal ? (
          <button disabled={!session.response} onClick={() => setShowApply(true)} type="button">Apply · 应用</button>
        ) : null}
      </div>
      {showApply && noteContext ? (
        <NiaApplyReview
          content={session.response}
          context={noteContext}
          onApply={(proposal) => onApplyProposal?.(proposal)}
          onDiscard={() => setShowApply(false)}
        />
      ) : null}
      {session.historyEnabled && session.history.length > 0 ? (
        <details>
          <summary>History</summary>
          <ol>
            {session.history.map((record) => (
              <li key={record.id}>
                <button onClick={() => setSelectedHistoryId(record.id)} type="button">{record.prompt}</button>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {supportedContexts.includes("browser") ? (
        <WorkflowRecorderPanel onRecordingComplete={(markdown) => setRecordedSource(markdown)} />
      ) : null}
      <WorkflowLibrary
        browserTarget={browserTarget}
        host={host}
        importedSource={recordedSource}
      />
      {healProposal && onAcceptHeal && onRejectHeal ? (
        <WorkflowHealReview proposal={healProposal} onAccept={onAcceptHeal} onReject={onRejectHeal} />
      ) : null}
    </aside>
  );
}
