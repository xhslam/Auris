import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function hasValidAiDockBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.aiDock ||
    (isFunction(bridge.aiDock.setActiveProvider) &&
      isFunction(bridge.aiDock.setActiveView) &&
      isFunction(bridge.aiDock.setVisibility) &&
      isFunction(bridge.aiDock.syncLayout))
  );
}

function hasValidAiPromptBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.aiPrompts ||
    (isFunction(bridge.aiPrompts.delete) &&
      isFunction(bridge.aiPrompts.export) &&
      isFunction(bridge.aiPrompts.import) &&
      isFunction(bridge.aiPrompts.importDefaultLibrary) &&
      isFunction(bridge.aiPrompts.list) &&
      isFunction(bridge.aiPrompts.save) &&
      isFunction(bridge.aiPrompts.search) &&
      isFunction(bridge.aiPrompts.update))
  );
}

function hasValidAiHistoryBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.aiHistory ||
    (isFunction(bridge.aiHistory.captureCurrentConversation) &&
      isFunction(bridge.aiHistory.delete) &&
      isFunction(bridge.aiHistory.export) &&
      isFunction(bridge.aiHistory.import) &&
      isFunction(bridge.aiHistory.list) &&
      isFunction(bridge.aiHistory.save) &&
      isFunction(bridge.aiHistory.search) &&
      isFunction(bridge.aiHistory.toggleFavorite))
  );
}

function hasValidVoiceEngineBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.voiceEngine ||
    (isFunction(bridge.voiceEngine.generate) &&
      isFunction(bridge.voiceEngine.getCapabilities) &&
      isFunction(bridge.voiceEngine.getStatus) &&
      isFunction(bridge.voiceEngine.start) &&
      isFunction(bridge.voiceEngine.stop))
  );
}

function hasValidNotesMcpBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.notesMcp ||
    (isFunction(bridge.notesMcp.getServerInfo) &&
      isFunction(bridge.notesMcp.updatePolicy) &&
      isFunction(bridge.notesMcp.onRequest))
  );
}

function hasValidClipboardBridge(bridge: Partial<DesktopBridge>) {
  return (
    !bridge.clipboard ||
    (isFunction(bridge.clipboard.writeText) &&
      (!bridge.clipboard.writeHtml || isFunction(bridge.clipboard.writeHtml)))
  );
}

function hasValidBrowserStatusBridge(bridge: Partial<DesktopBridge>) {
  return !bridge.browserStatus || (
    isFunction(bridge.browserStatus.focusBrowserTab)
    && isFunction(bridge.browserStatus.focusBrowserWindow)
    && isFunction(bridge.browserStatus.getBrowserStatus)
    && isFunction(bridge.browserStatus.subscribe)
  );
}

/**
 * 更新桥是可选的（旧版本 preload 没有它），但一旦存在就必须完整——半个更新桥
 * 会让 UI 显示可点的"立即检查"，点下去却是 `undefined is not a function`。
 */
function hasValidUpdatesBridge(bridge: Partial<DesktopBridge>) {
  return !bridge.updates || (
    isFunction(bridge.updates.check)
    && isFunction(bridge.updates.download)
    && isFunction(bridge.updates.getState)
    && isFunction(bridge.updates.onStateChange)
    && isFunction(bridge.updates.openReleases)
    && (!bridge.updates.publishRelease || isFunction(bridge.updates.publishRelease))
    && (!bridge.updates.syncRepository || isFunction(bridge.updates.syncRepository))
    && isFunction(bridge.updates.quitAndInstall)
    && isFunction(bridge.updates.reset)
    && isFunction(bridge.updates.recover)
  );
}

function hasValidDesktopIslandBridge(bridge: Partial<DesktopBridge>) {
  return !bridge.desktopIsland || (
    isFunction(bridge.desktopIsland.acknowledgeIntent)
    && isFunction(bridge.desktopIsland.getSettings)
    && isFunction(bridge.desktopIsland.listPendingIntents)
    && isFunction(bridge.desktopIsland.onIntent)
    && isFunction(bridge.desktopIsland.syncSnapshot)
    && isFunction(bridge.desktopIsland.updateSettings)
  );
}

export function isDesktopBridge(value: unknown): value is DesktopBridge {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bridge = value as Partial<DesktopBridge>;

  return Boolean(
    bridge.commands &&
      isFunction(bridge.commands.list) &&
      isFunction(bridge.commands.run) &&
      hasValidClipboardBridge(bridge) &&
      hasValidDesktopIslandBridge(bridge) &&
      hasValidBrowserStatusBridge(bridge) &&
      bridge.downloads &&
      isFunction(bridge.downloads.exportJson) &&
      (!bridge.downloads.exportPdf || isFunction(bridge.downloads.exportPdf)) &&
      (!bridge.downloads.exportText || isFunction(bridge.downloads.exportText)) &&
      isFunction(bridge.downloads.getDirectoryInfo) &&
      isFunction(bridge.downloads.revealDirectory) &&
      bridge.plugins &&
      isFunction(bridge.plugins.list) &&
      isFunction(bridge.plugins.openDirectory) &&
      isFunction(bridge.plugins.setEnabled) &&
      hasValidAiDockBridge(bridge) &&
      hasValidAiPromptBridge(bridge) &&
      hasValidAiHistoryBridge(bridge) &&
      hasValidNotesMcpBridge(bridge) &&
      bridge.runtimeState &&
      isFunction(bridge.runtimeState.get) &&
      isFunction(bridge.runtimeState.importLegacy) &&
      (!bridge.runtimeState.setResumeTarget ||
        isFunction(bridge.runtimeState.setResumeTarget)) &&
      isFunction(bridge.runtimeState.setLastWorkspace) &&
      bridge.system &&
      isFunction(bridge.system.openUpgrade) &&
      hasValidVoiceEngineBridge(bridge) &&
      (!bridge.terminal ||
        (isFunction(bridge.terminal.create) &&
          isFunction(bridge.terminal.kill) &&
          isFunction(bridge.terminal.list) &&
          isFunction(bridge.terminal.resume) &&
          isFunction(bridge.terminal.onData) &&
          isFunction(bridge.terminal.onExit) &&
          isFunction(bridge.terminal.resize) &&
          isFunction(bridge.terminal.write))) &&
      bridge.vault &&
      isFunction(bridge.vault.getDirectoryInfo) &&
      isFunction(bridge.vault.listFiles) &&
      isFunction(bridge.vault.onDidChange) &&
      isFunction(bridge.vault.pickDirectory) &&
      (!bridge.vault.pickFile || isFunction(bridge.vault.pickFile)) &&
      isFunction(bridge.vault.readFile) &&
      (!bridge.vault.createDirectory || isFunction(bridge.vault.createDirectory)) &&
      (!bridge.vault.moveFile || isFunction(bridge.vault.moveFile)) &&
      (!bridge.vault.renameFile || isFunction(bridge.vault.renameFile)) &&
      isFunction(bridge.vault.removeFile) &&
      isFunction(bridge.vault.revealPluginsDirectory) &&
      isFunction(bridge.vault.saveFile) &&
      (!bridge.videoLibrary ||
        (isFunction(bridge.videoLibrary.getSnapshot) &&
          isFunction(bridge.videoLibrary.getVideoDetails) &&
          isFunction(bridge.videoLibrary.importFiles) &&
          isFunction(bridge.videoLibrary.pickDirectory) &&
          isFunction(bridge.videoLibrary.refresh) &&
          isFunction(bridge.videoLibrary.revealDirectory) &&
          isFunction(bridge.videoLibrary.saveThumbnail) &&
          isFunction(bridge.videoLibrary.updateSourceMetadata))) &&
      hasValidUpdatesBridge(bridge) &&
      bridge.window &&
      isFunction(bridge.window.showInFolder),
  );
}

export function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return isDesktopBridge(window.shadowingDesktop) ? window.shadowingDesktop : null;
}

export function hasDesktopBridge() {
  return getDesktopBridge() !== null;
}

export type { DesktopBridge } from "@/platform/desktop/desktop-bridge";
