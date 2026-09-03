"use client";

import { NiaPanelWithSession, type NiaPanelProps } from "@/components/nia/nia-panel";
import { NiaProviderSettings } from "@/components/nia/nia-provider-settings";
import type { NiaSession } from "@/features/nia/use-nia-session";

export type NiaTextPaneTab = "chat" | "connection";

type NiaTextSidePaneProps = Omit<NiaPanelProps, "showProviderSettings"> & {
  onClose: () => void;
  onTabChange: (tab: NiaTextPaneTab) => void;
  session: NiaSession;
  tab: NiaTextPaneTab;
};

export function NiaTextSidePane({
  onClose,
  onTabChange,
  session,
  tab,
  ...panelProps
}: NiaTextSidePaneProps) {
  const selectedProvider = session.providers.find((provider) => provider.id === session.providerId) ?? null;
  const providerReady = Boolean(selectedProvider && session.model);

  return (
    <aside className="nia-workspace__text-pane" aria-label="文字模型侧栏">
      <header className="nia-workspace__text-pane-header">
        <div>
          <span>文字模型</span>
          <strong>{providerReady ? selectedProvider?.label : "尚未连接"}</strong>
          <small>{providerReady ? session.model : "连接 API Key 后开始文字对话"}</small>
        </div>
        <button aria-label="收起文字模型侧栏" onClick={onClose} type="button">›</button>
      </header>

      <nav aria-label="文字模型面板" className="nia-workspace__text-pane-tabs" role="tablist">
        <button aria-selected={tab === "chat"} onClick={() => onTabChange("chat")} role="tab" type="button">对话</button>
        <button aria-selected={tab === "connection"} onClick={() => onTabChange("connection")} role="tab" type="button">连接</button>
      </nav>

      <div className="nia-workspace__text-pane-body">
        {tab === "chat" ? (
          <section aria-label="文字对话" className="nia-workspace__text-chat" role="tabpanel">
            {!providerReady ? (
              <div className="nia-workspace__text-empty">
                <span aria-hidden="true">⌁</span>
                <strong>连接一个文字模型</strong>
                <p>API Key 只用于这里的键盘对话，不会改变 Codex 登录的 GPT Live 语音。</p>
                <button onClick={() => onTabChange("connection")} type="button">连接 API Key</button>
              </div>
            ) : null}
            <NiaPanelWithSession {...panelProps} session={session} showProviderSettings={false} />
          </section>
        ) : (
          <section aria-label="模型连接" className="nia-workspace__text-connection" role="tabpanel">
            <div className="nia-workspace__text-connection-intro">
              <span>独立文字通道</span>
              <h2>连接 API Key</h2>
              <p>选择服务商、模型和保存方式。密钥继续使用 Auris 原有的会话内存或 macOS 钥匙串能力。</p>
            </div>
            <NiaProviderSettings
              configMessage={session.configMessage}
              defaultOpen
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
              summary="API Key 与模型"
            />
          </section>
        )}
      </div>
    </aside>
  );
}
