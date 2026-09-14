import type { BrowserChromeWindow } from "@/features/browser/browser-bridge";

export function BrowserWindowMenu({
  currentWindowId,
  onCloseWindow,
  onCreateTab,
  onCreateWindow,
  onFocusWindow,
  windows,
}: {
  currentWindowId: string | null;
  onCloseWindow: (windowId: string) => void;
  onCreateTab: (windowId: string) => void;
  onCreateWindow: () => void;
  onFocusWindow: (windowId: string) => void;
  windows: readonly BrowserChromeWindow[];
}) {
  return (
    <details className="browser-window-menu">
      <summary>Windows · 窗口</summary>
      <div role="group" aria-label="Browser window controls">
        <button onClick={onCreateWindow} type="button">New window · 新建</button>
        <ul aria-label="Open browser windows">
          {windows.map((windowRecord, index) => (
            <li key={windowRecord.windowId}>
              <span>{windowRecord.windowId === currentWindowId ? "Current · 当前" : `Window ${index + 1}`}</span>
              <button aria-label={`Focus ${windowRecord.windowId}`} onClick={() => onFocusWindow(windowRecord.windowId)} type="button">Focus</button>
              <button aria-label={`New tab in ${windowRecord.windowId}`} onClick={() => onCreateTab(windowRecord.windowId)} type="button">Tab</button>
              <button aria-label={`Close ${windowRecord.windowId}`} onClick={() => onCloseWindow(windowRecord.windowId)} type="button">Close</button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
