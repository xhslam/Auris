"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DesktopBridge,
  DesktopBrowserGrantsSnapshot,
} from "@/platform/desktop/desktop-bridge";

const OPERATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  attach: "附着",
  click: "点击",
  eval: "脚本",
  key: "按键",
  navigate: "跳转",
  publish: "证据",
  read: "读取",
  scroll: "滚动",
  session: "会话",
  style: "样式",
  type: "输入",
  upload: "上传",
});

const EMPTY_SNAPSHOT: DesktopBrowserGrantsSnapshot = Object.freeze({
  attachments: [],
  available: false,
  standingGrants: [],
});

type BrowserGrantsApi = NonNullable<DesktopBridge["browserGrants"]>;

function isGrantsSnapshot(value: unknown): value is DesktopBrowserGrantsSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.available === "boolean"
    && Array.isArray(record.standingGrants)
    && Array.isArray(record.attachments);
}

function readBrowserGrantsApi(bridge?: DesktopBridge | null): BrowserGrantsApi | null {
  if (bridge?.browserGrants) {
    const api = bridge.browserGrants;
    if (
      typeof api.getSnapshot === "function"
      && typeof api.revoke === "function"
      && typeof api.subscribe === "function"
    ) {
      return api;
    }
  }
  if (typeof window === "undefined") return null;
  const host = window.shadowingDesktop?.browserGrants;
  if (
    !host
    || typeof host.getSnapshot !== "function"
    || typeof host.revoke !== "function"
    || typeof host.subscribe !== "function"
  ) {
    return null;
  }
  return host;
}

export function BrowserGrantCenter({
  bridge = null,
}: {
  bridge?: DesktopBridge | null;
}) {
  const [snapshot, setSnapshot] = useState<DesktopBrowserGrantsSnapshot>(EMPTY_SNAPSHOT);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [api, setApi] = useState<BrowserGrantsApi | null>(() => readBrowserGrantsApi(bridge));

  const applySnapshot = useCallback((value: unknown) => {
    setSnapshot(isGrantsSnapshot(value) ? value : EMPTY_SNAPSHOT);
  }, []);

  useEffect(() => {
    const nextApi = readBrowserGrantsApi(bridge);
    setApi(nextApi);
    if (!nextApi) {
      setSnapshot(EMPTY_SNAPSHOT);
      return undefined;
    }
    let active = true;
    const unsubscribe = nextApi.subscribe((next) => {
      if (active) applySnapshot(next);
    });
    void nextApi.getSnapshot()
      .then((next) => {
        if (active) applySnapshot(next);
      })
      .catch(() => {
        if (active) setSnapshot(EMPTY_SNAPSHOT);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot, bridge]);

  const revoke = useCallback(async (grantId: string) => {
    if (!api || revokingId) return;
    setRevokingId(grantId);
    try {
      const result = await api.revoke(grantId);
      applySnapshot(result.snapshot);
    } catch {
      // Main fails closed; keep current snapshot until the next live push.
    } finally {
      setRevokingId(null);
    }
  }, [api, applySnapshot, revokingId]);

  if (!api) {
    return (
      <div className="browser-grant-center browser-grant-center--unavailable" data-testid="browser-grant-center">
        <p>当前环境无法管理浏览器授权（仅桌面端可用）。</p>
      </div>
    );
  }

  if (!snapshot.available) {
    return (
      <div className="browser-grant-center browser-grant-center--unavailable" data-testid="browser-grant-center">
        <p>浏览器授权中心尚未就绪。打开浏览器窗口后，本次运行的授权会出现在这里。</p>
      </div>
    );
  }

  const grants = [
    ...snapshot.standingGrants.map((grant) => ({
      detail: grant.origin,
      grantId: grant.grantId,
      label: `记住：${OPERATION_LABELS[grant.operation] ?? grant.operation}`,
    })),
    ...snapshot.attachments.map((grant) => ({
      detail: `${grant.windowId} / ${grant.tabId}`,
      grantId: grant.grantId,
      label: grant.mode === "once" ? "挂接：仅一次" : "挂接：直到跳转",
    })),
  ];

  return (
    <div className="browser-grant-center" data-testid="browser-grant-center">
      <p className="browser-grant-center__hint">
        仅在本次 Auris 运行期间有效。关掉 App 后会全部清空；关掉设置面板不会撤销授权。
      </p>
      {grants.length === 0 ? (
        <p className="browser-grant-center__empty">当前没有已记住的浏览器授权。</p>
      ) : (
        <ul className="browser-grant-center__list">
          {grants.map((grant) => (
            <li key={grant.grantId}>
              <div>
                <strong>{grant.label}</strong>
                <span>{grant.detail}</span>
              </div>
              <button
                disabled={revokingId === grant.grantId}
                type="button"
                onClick={() => void revoke(grant.grantId)}
              >
                撤销
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
