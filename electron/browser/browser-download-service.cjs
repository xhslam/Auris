"use strict";

/**
 * Fail-closed downloads: never auto-save; human chooses destination.
 * Agents receive status only (no filesystem paths in callbacks by default).
 */
function createBrowserDownloadService({
  uxPolicy,
  showSaveDialog = null,
  onStatus = null,
} = {}) {
  if (!uxPolicy || typeof uxPolicy.decide !== "function") {
    throw new TypeError("Browser download service requires a UX policy.");
  }

  const attachments = new WeakMap();
  const activeItems = new WeakMap();

  function emitStatus(payload) {
    if (typeof onStatus !== "function") return;
    try {
      onStatus(Object.freeze({
        bytesReceived: Number.isFinite(payload.bytesReceived) ? payload.bytesReceived : 0,
        filename: typeof payload.filename === "string"
          ? payload.filename.slice(0, 256)
          : "",
        state: payload.state,
        tabId: payload.tabId,
        windowId: payload.windowId,
      }));
    } catch {
      /* status listeners own their failures */
    }
  }

  function cancelAll(webContents) {
    const items = activeItems.get(webContents);
    if (!items) return Object.freeze({ cancelled: 0 });
    let count = 0;
    for (const item of items) {
      try {
        if (typeof item.cancel === "function") {
          item.cancel();
          count += 1;
        }
      } catch {
        /* best-effort */
      }
    }
    items.clear();
    return Object.freeze({ cancelled: count });
  }

  function attach(webContents, { windowId, tabId } = {}) {
    if (!webContents || typeof webContents.session !== "object") {
      throw new TypeError("Browser download service requires webContents with a session.");
    }
    if (typeof windowId !== "string" || typeof tabId !== "string") {
      throw new TypeError("Browser download service requires windowId and tabId.");
    }

    const activeRef = { active: true };
    const items = new Set();
    activeItems.set(webContents, items);
    const session = webContents.session;

    const onWillDownload = async (event, item, contents) => {
      if (!activeRef.active) {
        try {
          item.cancel();
        } catch {
          /* ignore */
        }
        return;
      }
      if (contents !== webContents) return;

      const decision = uxPolicy.decide("download");
      if (decision.disposition !== "human-prompt") {
        item.cancel();
        emitStatus({
          filename: item.getFilename?.() || "",
          state: "denied",
          tabId,
          windowId,
        });
        return;
      }

      items.add(item);
      item.once("done", (_doneEvent, state) => {
        items.delete(item);
        emitStatus({
          bytesReceived: item.getReceivedBytes?.() || 0,
          filename: item.getFilename?.() || "",
          state: state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "failed",
          tabId,
          windowId,
        });
      });

      if (typeof showSaveDialog !== "function") {
        item.cancel();
        emitStatus({
          filename: item.getFilename?.() || "",
          state: "cancelled",
          tabId,
          windowId,
        });
        return;
      }

      let destination;
      try {
        destination = await showSaveDialog({
          defaultPath: item.getFilename?.() || "download",
          tabId,
          windowId,
        });
      } catch {
        destination = null;
      }

      if (!activeRef.active || !destination?.filePath) {
        try {
          item.cancel();
        } catch {
          /* ignore */
        }
        emitStatus({
          filename: item.getFilename?.() || "",
          state: "cancelled",
          tabId,
          windowId,
        });
        return;
      }

      try {
        item.setSavePath(destination.filePath);
        emitStatus({
          filename: item.getFilename?.() || "",
          state: "progressing",
          tabId,
          windowId,
        });
      } catch {
        try {
          item.cancel();
        } catch {
          /* ignore */
        }
        emitStatus({
          filename: item.getFilename?.() || "",
          state: "failed",
          tabId,
          windowId,
        });
      }
    };

    session.on("will-download", onWillDownload);
    attachments.set(webContents, activeRef);

    return () => {
      if (!activeRef.active) return false;
      activeRef.active = false;
      cancelAll(webContents);
      try {
        session.removeListener("will-download", onWillDownload);
      } catch {
        /* teardown */
      }
      activeItems.delete(webContents);
      attachments.delete(webContents);
      return true;
    };
  }

  return Object.freeze({
    attach,
    cancelAll,
  });
}

module.exports = {
  createBrowserDownloadService,
};
