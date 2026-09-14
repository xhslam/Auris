"use strict";

const { createBrowserPublicError } = require("../shared/browser-contract.cjs");

function createBrowserSessionCapabilities({
  cookieReplay = false,
  localStorageReplay = false,
  namedProfiles = false,
} = {}) {
  let state = {
    cookieReplay: cookieReplay === true,
    localStorageReplay: localStorageReplay === true,
    namedProfiles: namedProfiles === true,
  };

  function snapshot() {
    return Object.freeze({
      cookieReplay: state.cookieReplay,
      localStorageReplay: state.localStorageReplay,
      namedProfiles: state.namedProfiles,
    });
  }

  function markVerified(next = {}) {
    state = {
      cookieReplay: Object.hasOwn(next, "cookieReplay")
        ? next.cookieReplay === true
        : state.cookieReplay,
      localStorageReplay: Object.hasOwn(next, "localStorageReplay")
        ? next.localStorageReplay === true
        : state.localStorageReplay,
      namedProfiles: Object.hasOwn(next, "namedProfiles")
        ? next.namedProfiles === true
        : state.namedProfiles,
    };
    return snapshot();
  }

  function assertNamedProfileAllowed(action) {
    if (!state.namedProfiles) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action,
        capability: "named-session-profiles",
      });
    }
  }

  function assertNamedSessionAction(action) {
    assertNamedProfileAllowed(action);
    if (!state.cookieReplay && !state.localStorageReplay) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action,
        capability: "session-replay",
      });
    }
  }

  function assertSaveAllowed() {
    assertNamedSessionAction("session_save");
  }

  function assertLoadAllowed({ hasCookies = false, hasLocalStorage = false } = {}) {
    assertNamedProfileAllowed("session_load");
    if (!hasCookies && !hasLocalStorage) {
      // Entry gate before ciphertext is known: require at least one replay path.
      if (!state.cookieReplay && !state.localStorageReplay) {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          action: "session_load",
          capability: "session-replay",
        });
      }
      return;
    }
    if (hasCookies && !state.cookieReplay) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "session_load",
        capability: "cookie-replay",
      });
    }
    if (hasLocalStorage && !state.localStorageReplay) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "session_load",
        capability: "local-storage-replay",
      });
    }
  }

  function canCaptureCookies() {
    return state.cookieReplay === true;
  }

  function canCaptureLocalStorage() {
    return state.localStorageReplay === true;
  }

  return Object.freeze({
    assertLoadAllowed,
    assertSaveAllowed,
    canCaptureCookies,
    canCaptureLocalStorage,
    markVerified,
    snapshot,
  });
}

module.exports = {
  createBrowserSessionCapabilities,
};
