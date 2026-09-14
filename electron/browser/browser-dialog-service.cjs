"use strict";

const { createBrowserPublicError } = require("../shared/browser-contract.cjs");

/**
 * Main-owned JS dialog interception via CDP Page.javascriptDialogOpening.
 * No page preload. Prompt is always suppressed.
 */
function createBrowserDialogService({
  uxPolicy,
  showNativeDialog = null,
  attachDebugger = null,
} = {}) {
  if (!uxPolicy || typeof uxPolicy.decide !== "function") {
    throw new TypeError("Browser dialog service requires a UX policy.");
  }

  const pendingByContents = new WeakMap();
  const attachments = new WeakMap();

  function pendingList(webContents) {
    let list = pendingByContents.get(webContents);
    if (!list) {
      list = [];
      pendingByContents.set(webContents, list);
    }
    return list;
  }

  function snapshotPending(webContents) {
    const list = pendingByContents.get(webContents) || [];
    return Object.freeze(list.map((entry) => Object.freeze({
      kind: entry.kind,
      message: typeof entry.message === "string"
        ? entry.message.slice(0, 512)
        : "",
      tabId: entry.tabId,
      windowId: entry.windowId,
    })));
  }

  async function handleOpening(webContents, params, { windowId, tabId, activeRef }) {
    if (!activeRef.active) return;
    const kind = params?.type === "confirm"
      ? "confirm"
      : params?.type === "prompt"
        ? "prompt"
        : "alert";
    const decision = uxPolicy.decide(kind);
    const debuggerApi = webContents.debugger;

    async function respond(accept, promptText) {
      if (!activeRef.active) return;
      if (!debuggerApi?.isAttached?.()) return;
      try {
        await debuggerApi.sendCommand("Page.handleJavaScriptDialog", {
          accept: accept === true,
          ...(promptText !== undefined ? { promptText: String(promptText) } : {}),
        });
      } catch {
        // Teardown races are fail-closed no-ops.
      }
    }

    if (decision.disposition === "suppress" || decision.disposition === "deny" || kind === "prompt") {
      await respond(false);
      return;
    }

    if (decision.disposition !== "native-dialog") {
      await respond(false);
      return;
    }

    const entry = {
      kind,
      message: typeof params?.message === "string" ? params.message : "",
      tabId,
      windowId,
    };
    const list = pendingList(webContents);
    list.push(entry);

    const finish = async (accept) => {
      const index = list.indexOf(entry);
      if (index >= 0) list.splice(index, 1);
      await respond(accept === true);
    };

    if (typeof showNativeDialog !== "function") {
      // Headless / smoke default: accept alert, accept confirm as true.
      await finish(kind === "alert" || kind === "confirm");
      return;
    }

    try {
      const result = await showNativeDialog({
        kind,
        message: entry.message,
        tabId,
        windowId,
      });
      if (!activeRef.active) {
        await respond(false);
        return;
      }
      await finish(result?.accept === true);
    } catch {
      await finish(false);
    }
  }

  function cancelAll(webContents) {
    const list = pendingByContents.get(webContents);
    if (list) list.length = 0;
    const attachment = attachments.get(webContents);
    if (!attachment?.active) return Object.freeze({ cancelled: 0 });
    const debuggerApi = webContents.debugger;
    if (debuggerApi?.isAttached?.()) {
      void debuggerApi.sendCommand("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
    }
    return Object.freeze({ cancelled: true });
  }

  function attach(webContents, { windowId, tabId } = {}) {
    if (!webContents || typeof webContents.on !== "function") {
      throw new TypeError("Browser dialog service requires webContents.");
    }
    if (typeof windowId !== "string" || typeof tabId !== "string") {
      throw new TypeError("Browser dialog service requires windowId and tabId.");
    }

    let dialogsAvailable = true;
    try {
      uxPolicy.assertDialogCapability();
    } catch (error) {
      if (error?.code !== "CAPABILITY_NOT_VERIFIED") throw error;
      dialogsAvailable = false;
    }

    const activeRef = { active: true };
    if (!dialogsAvailable) {
      attachments.set(webContents, activeRef);
      return () => {
        if (!activeRef.active) return false;
        activeRef.active = false;
        attachments.delete(webContents);
        return true;
      };
    }

    const debuggerApi = webContents.debugger;
    if (!debuggerApi || typeof debuggerApi.attach !== "function") {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-js-dialogs",
      });
    }

    const ownedAttach = typeof attachDebugger === "function"
      ? attachDebugger
      : (contents) => {
        if (!contents.debugger.isAttached()) {
          contents.debugger.attach("1.3");
        }
        return () => {
          if (contents.debugger.isAttached()) {
            try {
              contents.debugger.detach();
            } catch {
              /* best-effort */
            }
          }
        };
      };

    const detachDebugger = ownedAttach(webContents);
    let messageHandler = null;
    let enabled = Promise.resolve();

    async function enable() {
      await debuggerApi.sendCommand("Page.enable");
      // Intercept file chooser so AI cannot inject paths; human picker via callback.
      try {
        await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true });
      } catch {
        // Older builds may lack the method; upload stays human-gated elsewhere.
      }
    }

    enabled = enable();

    messageHandler = (_event, method, params) => {
      if (!activeRef.active) return;
      if (method === "Page.javascriptDialogOpening") {
        void enabled.then(() => handleOpening(webContents, params, { activeRef, tabId, windowId }));
        return;
      }
      if (method === "Page.fileChooserOpened") {
        const decision = uxPolicy.decide("upload");
        if (decision.disposition !== "human-prompt") {
          void debuggerApi.sendCommand("Page.handleFileChooser", {
            action: "cancel",
          }).catch(() => {});
          return;
        }
        if (typeof showNativeDialog !== "function") {
          void debuggerApi.sendCommand("Page.handleFileChooser", {
            action: "cancel",
          }).catch(() => {});
          return;
        }
        void Promise.resolve(showNativeDialog({
          kind: "upload",
          mode: params?.mode,
          tabId,
          windowId,
        })).then((result) => {
          if (!activeRef.active) {
            return debuggerApi.sendCommand("Page.handleFileChooser", { action: "cancel" });
          }
          if (result?.action === "select" && Array.isArray(result.paths)) {
            return debuggerApi.sendCommand("Page.handleFileChooser", {
              action: "select",
              files: result.paths,
            });
          }
          return debuggerApi.sendCommand("Page.handleFileChooser", { action: "cancel" });
        }).catch(() => {
          void debuggerApi.sendCommand("Page.handleFileChooser", { action: "cancel" }).catch(() => {});
        });
      }
    };

    debuggerApi.on("message", messageHandler);
    void enabled.catch(() => {
      // Capability stays fail-closed if Page.enable fails.
    });

    const onNavigate = () => {
      cancelAll(webContents);
    };
    webContents.on("did-start-navigation", onNavigate);
    webContents.on("did-navigate", onNavigate);

    attachments.set(webContents, activeRef);

    const dispose = () => {
      if (!activeRef.active) return false;
      activeRef.active = false;
      cancelAll(webContents);
      try {
        webContents.removeListener("did-start-navigation", onNavigate);
        webContents.removeListener("did-navigate", onNavigate);
      } catch {
        /* teardown */
      }
      try {
        debuggerApi.removeListener?.("message", messageHandler);
      } catch {
        /* teardown */
      }
      try {
        detachDebugger?.();
      } catch {
        /* teardown */
      }
      pendingByContents.delete(webContents);
      attachments.delete(webContents);
      return true;
    };
    dispose.ready = enabled;
    return dispose;
  }

  return Object.freeze({
    attach,
    cancelAll,
    snapshotPending,
  });
}

module.exports = {
  createBrowserDialogService,
};
