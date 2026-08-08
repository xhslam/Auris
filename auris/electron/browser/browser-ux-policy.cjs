"use strict";

const { createBrowserPublicError } = require("../shared/browser-contract.cjs");

const UX_SURFACES = Object.freeze([
  "alert",
  "confirm",
  "prompt",
  "popup",
  "download",
  "upload",
  "certificate",
  "http-auth",
  "camera",
  "microphone",
  "geolocation",
  "notifications",
  "external-protocol",
  "find",
  "zoom",
  "context-menu",
  "print",
  "devtools",
  "pdf",
  "media",
  "fullscreen",
]);

const DEFAULT_DISPOSITIONS = Object.freeze({
  alert: Object.freeze({ disposition: "native-dialog", reason: "bounded-native-alert" }),
  confirm: Object.freeze({ disposition: "native-dialog", reason: "bounded-native-confirm" }),
  prompt: Object.freeze({ disposition: "suppress", reason: "prompt-unsupported" }),
  popup: Object.freeze({ disposition: "deny", reason: "popup-blocked" }),
  download: Object.freeze({ disposition: "human-prompt", reason: "human-save-destination" }),
  upload: Object.freeze({ disposition: "human-prompt", reason: "human-native-picker" }),
  certificate: Object.freeze({ disposition: "deny", reason: "tls-hard-deny" }),
  "http-auth": Object.freeze({ disposition: "human-prompt", reason: "human-http-auth" }),
  camera: Object.freeze({ disposition: "deny", reason: "browsed-page-permission-denied" }),
  microphone: Object.freeze({ disposition: "deny", reason: "browsed-page-permission-denied" }),
  geolocation: Object.freeze({ disposition: "deny", reason: "browsed-page-permission-denied" }),
  notifications: Object.freeze({ disposition: "deny", reason: "browsed-page-permission-denied" }),
  "external-protocol": Object.freeze({ disposition: "deny", reason: "external-protocol-blocked" }),
  find: Object.freeze({ disposition: "chrome-only", reason: "trusted-chrome-find" }),
  zoom: Object.freeze({ disposition: "chrome-only", reason: "trusted-chrome-zoom" }),
  "context-menu": Object.freeze({ disposition: "chrome-only", reason: "trusted-chrome-context-menu" }),
  print: Object.freeze({ disposition: "deny", reason: "print-unsupported" }),
  devtools: Object.freeze({ disposition: "deny", reason: "devtools-debug-builds-only" }),
  pdf: Object.freeze({ disposition: "engine-if-permitted", reason: "pdf-after-isolation-checks" }),
  media: Object.freeze({ disposition: "engine-if-permitted", reason: "media-after-permission-checks" }),
  fullscreen: Object.freeze({ disposition: "deny", reason: "fullscreen-denied" }),
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function createBrowserUxPolicy({
  disableDialogs = false,
  isDevelopmentBuild = () => false,
} = {}) {
  const dialogsDisabled = disableDialogs === true;
  const developmentBuild = typeof isDevelopmentBuild === "function"
    ? isDevelopmentBuild
    : () => false;

  function snapshot() {
    return deepFreeze({
      disableDialogs: dialogsDisabled,
      dispositions: { ...DEFAULT_DISPOSITIONS },
      surfaces: [...UX_SURFACES],
    });
  }

  function assertDialogCapability() {
    if (dialogsDisabled) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-js-dialogs",
      });
    }
  }

  function decide(surface, context = {}) {
    if (!UX_SURFACES.includes(surface)) {
      return Object.freeze({
        disposition: "deny",
        reason: "unknown-surface",
        surface,
      });
    }

    if ((surface === "alert" || surface === "confirm" || surface === "prompt") && dialogsDisabled) {
      return Object.freeze({
        disposition: "deny",
        reason: "dialogs-capability-unverified",
        surface,
      });
    }

    if (surface === "devtools") {
      if (context?.isDevelopmentBuild === true || developmentBuild(context) === true) {
        return Object.freeze({
          disposition: "allow",
          reason: "development-build",
          surface,
        });
      }
      return Object.freeze({ ...DEFAULT_DISPOSITIONS.devtools, surface });
    }

    return Object.freeze({ ...DEFAULT_DISPOSITIONS[surface], surface });
  }

  return Object.freeze({
    assertDialogCapability,
    decide,
    snapshot,
    surfaces: UX_SURFACES,
  });
}

module.exports = {
  DEFAULT_DISPOSITIONS,
  UX_SURFACES,
  createBrowserUxPolicy,
};
