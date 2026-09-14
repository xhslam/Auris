"use strict";

const { deepFreeze } = require("./browser-registry.cjs");

const BROWSER_GRANTS_SNAPSHOT_CHANNEL = "shadowing:browser-grants:get-snapshot";
const BROWSER_GRANTS_REVOKE_CHANNEL = "shadowing:browser-grants:revoke";
const BROWSER_GRANTS_CHANGED_CHANNEL = "shadowing:browser-grants:changed";

function createBrowserGrantsIpc({
  grantAuthority = null,
  ipcMain,
  requireTrustedDesktopEvent,
  webContentsFromEvent,
}) {
  if (typeof requireTrustedDesktopEvent !== "function") {
    throw new TypeError("Browser grants IPC requires a trusted desktop event gate.");
  }
  if (typeof webContentsFromEvent !== "function") {
    throw new TypeError("Browser grants IPC requires a webContents resolver.");
  }

  const subscribers = new Set();
  let registered = false;
  let unsubscribeGrants = null;

  function snapshotOrUnavailable() {
    if (!grantAuthority || typeof grantAuthority.snapshot !== "function") {
      return deepFreeze({
        attachments: [],
        available: false,
        standingGrants: [],
      });
    }
    const snapshot = grantAuthority.snapshot();
    return deepFreeze({
      attachments: snapshot.attachments ?? [],
      available: true,
      standingGrants: snapshot.standingGrants ?? [],
    });
  }

  function publish() {
    const payload = snapshotOrUnavailable();
    for (const contents of [...subscribers]) {
      if (contents.isDestroyed?.()) {
        subscribers.delete(contents);
        continue;
      }
      try {
        contents.send(BROWSER_GRANTS_CHANGED_CHANNEL, payload);
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

  function handleRevoke(event, grantId) {
    requireTrustedDesktopEvent(event);
    if (!grantAuthority || typeof grantAuthority.revoke !== "function") {
      throw new Error("Browser grant authority is unavailable");
    }
    if (typeof grantId !== "string" || grantId.length === 0 || grantId.length > 128) {
      throw new TypeError("Invalid Browser grant id.");
    }
    const result = grantAuthority.revoke(grantId);
    publish();
    return deepFreeze({ ...result, snapshot: snapshotOrUnavailable() });
  }

  function register() {
    if (registered) return false;
    registered = true;
    ipcMain.handle(BROWSER_GRANTS_SNAPSHOT_CHANNEL, handleGetSnapshot);
    ipcMain.handle(BROWSER_GRANTS_REVOKE_CHANNEL, handleRevoke);
    if (typeof grantAuthority?.subscribe === "function") {
      unsubscribeGrants = grantAuthority.subscribe(() => publish());
    }
    return true;
  }

  function dispose() {
    if (!registered) return;
    ipcMain.removeHandler(BROWSER_GRANTS_SNAPSHOT_CHANNEL);
    ipcMain.removeHandler(BROWSER_GRANTS_REVOKE_CHANNEL);
    unsubscribeGrants?.();
    unsubscribeGrants = null;
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
  BROWSER_GRANTS_CHANGED_CHANNEL,
  BROWSER_GRANTS_REVOKE_CHANNEL,
  BROWSER_GRANTS_SNAPSHOT_CHANNEL,
  createBrowserGrantsIpc,
};
