"use strict";

/**
 * Trusted Electron input hooks for human reclaim.
 * Page-script dispatchEvent cannot emit these events.
 */
function createBrowserHumanReclaim({
  reclaim,
} = {}) {
  if (typeof reclaim !== "function") {
    throw new TypeError("Browser human reclaim requires a synchronous reclaim callback.");
  }

  function attach(webContents, { windowId, tabId } = {}) {
    if (!webContents || typeof webContents.on !== "function") {
      throw new TypeError("Browser human reclaim requires a webContents.");
    }
    if (typeof windowId !== "string" || typeof tabId !== "string") {
      throw new TypeError("Browser human reclaim requires windowId and tabId.");
    }

    let active = true;
    const onInput = (_event, input) => {
      if (!active) return;
      if (input?.type !== "keyDown") return;
      if (input?.isAutoRepeat === true) return;
      reclaim({
        reason: "keyboard",
        tabId,
        windowId,
      });
    };
    const onMouse = (_event, mouse) => {
      if (!active) return;
      if (mouse?.type !== "mouseDown") return;
      reclaim({
        reason: "mouse",
        tabId,
        windowId,
      });
    };

    webContents.on("before-input-event", onInput);
    if (typeof webContents.on === "function") {
      webContents.on("before-mouse-event", onMouse);
    }

    return () => {
      if (!active) return false;
      active = false;
      try {
        webContents.removeListener?.("before-input-event", onInput);
        webContents.removeListener?.("before-mouse-event", onMouse);
      } catch {
        // Teardown is best-effort once the view is already destroyed.
      }
      return true;
    };
  }

  return Object.freeze({ attach });
}

module.exports = {
  createBrowserHumanReclaim,
};
