"use strict";

const { deepFreeze } = require("./browser-registry.cjs");

const BROWSER_SECURITY_SNAPSHOT_CHANNEL = "shadowing:browser-security:get-snapshot";
const BROWSER_SECURITY_SET_AUTOMATION_CHANNEL =
  "shadowing:browser-security:set-automation-enabled";
const BROWSER_SECURITY_CHANGED_CHANNEL = "shadowing:browser-security:changed";

function createBrowserSecurityIpc({
  getCapabilitiesSnapshot,
  ipcMain,
  requireTrustedDesktopEvent,
  setAutomationEnabled,
  webContentsFromEvent,
}) {
  if (typeof requireTrustedDesktopEvent !== "function") {
    throw new TypeError("Browser security IPC requires a trusted desktop event gate.");
  }
  if (typeof webContentsFromEvent !== "function") {
    throw new TypeError("Browser security IPC requires a webContents resolver.");
  }
  if (typeof getCapabilitiesSnapshot !== "function") {
    throw new TypeError("Browser security IPC requires a capabilities snapshot reader.");
  }
  if (typeof setAutomationEnabled !== "function") {
    throw new TypeError("Browser security IPC requires an automation setter.");
  }

  const subscribers = new Set();
  let registered = false;

  function snapshotOrUnavailable() {
    try {
      const snapshot = getCapabilitiesSnapshot();
      return deepFreeze({
        available: true,
        ...snapshot,
      });
    } catch {
      return deepFreeze({
        available: false,
        automationEnabled: false,
        automationToggleAvailable: false,
        cookieReplay: false,
        eval: Object.freeze({
          description: "",
          enabled: false,
          scope: "",
        }),
        localFixture: false,
        localStorageReplay: false,
        namedProfiles: false,
        production: false,
        securityReason: "browser-security-unavailable",
        securityVerified: false,
      });
    }
  }

  function publish() {
    const payload = snapshotOrUnavailable();
    for (const contents of [...subscribers]) {
      if (contents.isDestroyed?.()) {
        subscribers.delete(contents);
        continue;
      }
      try {
        contents.send(BROWSER_SECURITY_CHANGED_CHANNEL, payload);
      } catch {
        subscribers.delete(contents);
      }
    }
  }

  function handleGetSnapshot(event) {
    requireTrustedDesktopEvent(event);
    const contents = webContentsFromEvent(event);
    if (contents) subscribers.add(contents);
    return snapshotOrUnavailable();
  }

  function handleSetAutomation(event, enabled) {
    requireTrustedDesktopEvent(event);
    const snapshot = setAutomationEnabled(enabled === true);
    publish();
    return deepFreeze({
      available: true,
      ...snapshot,
    });
  }

  function register() {
    if (registered) return false;
    registered = true;
    ipcMain.handle(BROWSER_SECURITY_SNAPSHOT_CHANNEL, handleGetSnapshot);
    ipcMain.handle(BROWSER_SECURITY_SET_AUTOMATION_CHANNEL, handleSetAutomation);
    return true;
  }

  function dispose() {
    if (!registered) return;
    ipcMain.removeHandler(BROWSER_SECURITY_SNAPSHOT_CHANNEL);
    ipcMain.removeHandler(BROWSER_SECURITY_SET_AUTOMATION_CHANNEL);
    subscribers.clear();
    registered = false;
  }

  return Object.freeze({
    dispose,
    publish,
    register,
    snapshot: snapshotOrUnavailable,
  });
}

module.exports = {
  BROWSER_SECURITY_CHANGED_CHANNEL,
  BROWSER_SECURITY_SET_AUTOMATION_CHANNEL,
  BROWSER_SECURITY_SNAPSHOT_CHANNEL,
  createBrowserSecurityIpc,
};
