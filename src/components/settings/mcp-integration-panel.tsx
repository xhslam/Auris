"use client";

import { useCallback, useEffect, useState } from "react";

type McpStatus = {
  enabled: boolean;
  policy: {
    autoApproveEdits: boolean;
    enabled: boolean;
    startOnLaunch: boolean;
  };
  port: number | null;
};

type McpClientStatus = "connected" | "not-installed" | "outdated" | "unreadable";

type McpClient = {
  configPath: string;
  detail: string;
  format: "json" | "toml";
  id: string;
  label: string;
  status: McpClientStatus;
};

type McpBridge = {
  getServerInfo: () => Promise<McpStatus>;
  installClient: (clientId: string) => Promise<McpClient[]>;
  listClients: () => Promise<McpClient[]>;
  removeClient: (clientId: string) => Promise<McpClient[]>;
  updatePolicy: (policy: Partial<McpStatus["policy"]>) => Promise<McpStatus>;
};

const STATUS_LABEL: Record<McpClientStatus, string> = {
  connected: "已接入",
  "not-installed": "未接入",
  outdated: "需修复",
  unreadable: "无法读取",
};

function McpClientsSection({ bridge }: { bridge: McpBridge }) {
  const [clients, setClients] = useState<McpClient[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void bridge
      .listClients()
      .then((next) => {
        setClients(next);
        setError(null);
      })
      .catch(() => setError("无法检测客户端配置"));
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAction = async (clientId: string, action: "install" | "remove") => {
    setBusyId(clientId);
    setError(null);
    try {
      const next =
        action === "install" ? await bridge.installClient(clientId) : await bridge.removeClient(clientId);
      setClients(next);
    } catch {
      setError(action === "install" ? "写入配置失败" : "移除配置失败");
    } finally {
      setBusyId(null);
    }
  };

  if (!clients) {
    return <p className="desktop-settings-shell__hint">正在检测 Claude、Codex 客户端配置…</p>;
  }

  return (
    <div className="desktop-settings-shell__group" aria-label="MCP 客户端接入">
      <div>
        <strong>客户端接入</strong>
        <p>把 Auris 笔记 MCP 一键写入下方客户端配置；修改前会自动备份，移除时只清理 Auris 自己的条目。</p>
        {error ? <p className="desktop-settings-shell__hint" role="alert">{error}</p> : null}
        <ul className="desktop-settings-shell__client-list">
          {clients.map((client) => {
            const isBusy = busyId === client.id;
            const installed = client.status === "connected";
            const needsRepair = client.status === "outdated";
            return (
              <li key={client.id} className="desktop-settings-shell__client-row">
                <div>
                  <span className="desktop-settings-shell__client-name">{client.label}</span>
                  <span className={`desktop-settings-shell__client-badge desktop-settings-shell__client-badge--${client.status}`}>
                    {STATUS_LABEL[client.status]}
                  </span>
                  <span className="desktop-settings-shell__client-detail">{client.detail}</span>
                </div>
                <div className="desktop-settings-shell__client-actions">
                  {installed ? null : (
                    <button
                      disabled={isBusy || client.status === "unreadable"}
                      onClick={() => void runAction(client.id, "install")}
                      type="button"
                    >
                      {needsRepair ? "修复" : "安装"}
                    </button>
                  )}
                  {client.status === "not-installed" || client.status === "unreadable" ? null : (
                    <button
                      disabled={isBusy}
                      onClick={() => void runAction(client.id, "remove")}
                      type="button"
                    >
                      移除
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function McpIntegrationPanel({ bridge }: { bridge: McpBridge | null }) {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getServerInfo().then(setStatus).catch(() => setStatus(null));
  }, [bridge]);

  const update = async (policy: Partial<McpStatus["policy"]>) => {
    if (!bridge) return;
    setIsUpdating(true);
    try {
      setStatus(await bridge.updatePolicy(policy));
    } finally {
      setIsUpdating(false);
    }
  };

  if (!bridge) {
    return <p>仅桌面版支持管理本地 MCP 服务。</p>;
  }

  const policy = status?.policy ?? { autoApproveEdits: false, enabled: false, startOnLaunch: true };

  return (
    <>
      <article className="desktop-settings-shell__group" aria-label="MCP 服务">
        <div>
          <strong>MCP 服务</strong>
          <p>{status?.enabled ? "运行中 · 允许外部 Agent 安全操作当前 Auris 笔记库" : "已停止 · 启用后可连接 Claude、Codex 和 Gemini"}</p>
          <label><input aria-label="启用 MCP 服务" checked={policy.enabled} disabled={isUpdating} onChange={(event) => void update({ enabled: event.target.checked })} type="checkbox" /> 启用 MCP 服务</label>
          <label><input aria-label="启动时启动 MCP" checked={policy.startOnLaunch} disabled={isUpdating} onChange={(event) => void update({ startOnLaunch: event.target.checked })} type="checkbox" /> 启动时启动</label>
          <label><input aria-label="自动批准 MCP 编辑" checked={policy.autoApproveEdits} disabled={isUpdating || !policy.enabled} onChange={(event) => void update({ autoApproveEdits: event.target.checked })} type="checkbox" /> 自动批准编辑（谨慎使用）</label>
        </div>
        <span className="desktop-settings-shell__value">{status?.enabled ? "已运行" : "已停止"}</span>
      </article>
      <McpClientsSection bridge={bridge} />
    </>
  );
}
