"use client";

import { useEffect, useState } from "react";
import { BrowserStatusItem } from "@/components/desktop/browser-status-item";
import type { BrowserStatusSnapshot } from "@/features/browser/window-status";
import type { DesktopBrowserStatusBridge } from "@/platform/desktop/desktop-bridge";

export function BrowserStatusCenter({ bridge }: { bridge: DesktopBrowserStatusBridge | null }) {
  const [snapshot, setSnapshot] = useState<BrowserStatusSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(bridge === null);

  useEffect(() => {
    if (!bridge) { setUnavailable(true); setSnapshot(null); return; }
    let active = true;
    setUnavailable(false);
    void bridge.getBrowserStatus()
      .then((value) => { if (active) setSnapshot(value); })
      .catch(() => { if (active) setUnavailable(true); });
    const unsubscribe = bridge.subscribe((value) => { if (active) setSnapshot(value); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);

  const focusWindow = (windowId: string) => { void bridge?.focusBrowserWindow(windowId); };
  const focusTab = (windowId: string, tabId: string) => { void bridge?.focusBrowserTab(windowId, tabId); };

  return (
    <aside aria-label="Browser status center" className="browser-status-center">
      <details>
        <summary>
          Browser status
          {snapshot?.pendingApprovalCount ? <span aria-label={`${snapshot.pendingApprovalCount} pending approvals`}>{snapshot.pendingApprovalCount}</span> : null}
        </summary>
        <div className="browser-status-center__panel">
          {unavailable ? <p role="status">Browser status is unavailable.</p> : null}
          {!unavailable && snapshot && snapshot.windows.length === 0 ? <p role="status">No browser windows are open.</p> : null}
          {snapshot && snapshot.windows.length > 0 ? (
            <ul aria-label="Browser windows">
              {snapshot.windows.map((windowStatus) => (
                <BrowserStatusItem
                  key={windowStatus.windowId}
                  onFocusTab={focusTab}
                  onFocusWindow={focusWindow}
                  windowStatus={windowStatus}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
