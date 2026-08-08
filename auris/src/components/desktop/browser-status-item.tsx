import type { BrowserWindowStatus } from "@/features/browser/window-status";

export function BrowserStatusItem({
  onFocusTab,
  onFocusWindow,
  windowStatus,
}: {
  onFocusTab: (windowId: string, tabId: string) => void;
  onFocusWindow: (windowId: string) => void;
  windowStatus: BrowserWindowStatus;
}) {
  return (
    <li className="browser-status-item">
      <button
        aria-label={`Focus browser window ${windowStatus.windowId}`}
        className="browser-status-item__window"
        onClick={() => onFocusWindow(windowStatus.windowId)}
        type="button"
      >
        <span>{windowStatus.active ? "Current window" : "Browser window"}</span>
        <small>{windowStatus.lifecycle}</small>
      </button>
      <ul aria-label={`Tabs in ${windowStatus.windowId}`}>
        {windowStatus.tabs.map((tab) => (
          <li key={tab.tabId}>
            <button
              aria-current={tab.active ? "true" : undefined}
              aria-label={`Focus tab ${tab.title || tab.url || tab.tabId}`}
              onClick={() => onFocusTab(windowStatus.windowId, tab.tabId)}
              type="button"
            >
              <span>{tab.title || tab.url || "Untitled tab"}</span>
              <small>
                {tab.loading ? "Loading" : tab.lifecycle}
                {tab.activity !== "idle" ? ` · ${tab.activity}` : ""}
                {tab.pendingApprovalCount > 0 ? ` · ${tab.pendingApprovalCount} approval` : ""}
                {tab.standingGrant ? " · standing grant" : ""}
              </small>
              {tab.url ? <code>{tab.url}</code> : null}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
