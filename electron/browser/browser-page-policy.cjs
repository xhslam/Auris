"use strict";

const { createBrowserUxPolicy } = require("./browser-ux-policy.cjs");

function decideHttpNavigation(value) {
  if (typeof value !== "string" || value.length > 8_192 || value.includes("\\")) {
    return { allowed: false, reason: "INVALID_URL" };
  }
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return { allowed: false, reason: "SCHEME_OR_CREDENTIALS_BLOCKED" };
    }
    return { allowed: true, url: url.href };
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }
}

function createBrowserPagePolicy({
  decideNavigation = decideHttpNavigation,
  uxPolicy = createBrowserUxPolicy(),
  showHttpAuthPrompt = null,
  isDevelopmentBuild = () => false,
} = {}) {
  if (!uxPolicy || typeof uxPolicy.decide !== "function") {
    throw new TypeError("Browser page policy requires a UX policy.");
  }

  function attach(webContents) {
    let disposed = false;

    const denyWebview = (event) => event?.preventDefault?.();
    const guardNavigation = (event, url) => {
      if (disposed) return;
      if (!decideNavigation(url)?.allowed) {
        event?.preventDefault?.();
        return;
      }
    };

    const onCertificateError = (event, _url, _error, _certificate, callback) => {
      if (disposed) {
        callback?.(false);
        return;
      }
      const decision = uxPolicy.decide("certificate");
      event?.preventDefault?.();
      callback?.(decision.disposition === "allow");
    };

    const onLogin = (event, _authenticationResponseDetails, _authInfo, callback) => {
      if (disposed) {
        callback?.();
        return;
      }
      event?.preventDefault?.();
      const decision = uxPolicy.decide("http-auth");
      if (decision.disposition !== "human-prompt" || typeof showHttpAuthPrompt !== "function") {
        callback?.();
        return;
      }
      void Promise.resolve(showHttpAuthPrompt({
        // Never pass secrets into page/MCP; prompt UI is main-owned.
        host: _authInfo?.host,
        realm: _authInfo?.realm,
      })).then((credentials) => {
        if (disposed) {
          callback?.();
          return;
        }
        if (
          credentials
          && typeof credentials.username === "string"
          && typeof credentials.password === "string"
        ) {
          callback?.(credentials.username, credentials.password);
          return;
        }
        callback?.();
      }).catch(() => {
        callback?.();
      });
    };

    const onContextMenu = (event) => {
      if (disposed) return;
      const decision = uxPolicy.decide("context-menu");
      if (decision.disposition === "deny" || decision.disposition === "chrome-only") {
        event?.preventDefault?.();
      }
    };

    const onDevtoolsOpened = () => {
      if (disposed) return;
      const decision = uxPolicy.decide("devtools", { isDevelopmentBuild: isDevelopmentBuild() });
      if (decision.disposition !== "allow") {
        try {
          webContents.closeDevTools?.();
        } catch {
          /* ignore */
        }
      }
    };

    const onEnterFullScreen = () => {
      if (disposed) return;
      const decision = uxPolicy.decide("fullscreen");
      if (decision.disposition === "deny") {
        try {
          // Prefer host-window exit when available; avoid page-world scripts.
          const host = webContents.getOwnerBrowserWindow?.();
          host?.setFullScreen?.(false);
        } catch {
          /* ignore */
        }
      }
    };

    webContents.on("will-attach-webview", denyWebview);
    webContents.on("will-navigate", guardNavigation);
    webContents.on("certificate-error", onCertificateError);
    webContents.on("login", onLogin);
    webContents.on("context-menu", onContextMenu);
    webContents.on("devtools-opened", onDevtoolsOpened);
    webContents.on("enter-html-full-screen", onEnterFullScreen);
    webContents.setWindowOpenHandler(() => {
      const decision = uxPolicy.decide("popup");
      return { action: decision.disposition === "allow" ? "allow" : "deny" };
    });

    // Print is unsupported: intercept beforeunload-unrelated print shortcuts when possible.
    const onBeforeInput = (event, input) => {
      if (disposed) return;
      if (uxPolicy.decide("print").disposition !== "deny") return;
      const key = String(input?.key || "").toLowerCase();
      if ((input?.control || input?.meta) && key === "p") {
        event?.preventDefault?.();
      }
    };
    webContents.on("before-input-event", onBeforeInput);

    return () => {
      if (disposed) return;
      disposed = true;
      webContents.removeListener("will-attach-webview", denyWebview);
      webContents.removeListener("will-navigate", guardNavigation);
      webContents.removeListener("certificate-error", onCertificateError);
      webContents.removeListener("login", onLogin);
      webContents.removeListener("context-menu", onContextMenu);
      webContents.removeListener("devtools-opened", onDevtoolsOpened);
      webContents.removeListener("enter-html-full-screen", onEnterFullScreen);
      webContents.removeListener("before-input-event", onBeforeInput);
      webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    };
  }

  return Object.freeze({ attach, decideNavigation, uxPolicy });
}

module.exports = { createBrowserPagePolicy, decideHttpNavigation };
