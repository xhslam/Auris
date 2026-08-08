"use strict";

const { createBrowserPublicError } = require("../shared/browser-contract.cjs");
const { createBrowserPagePolicy } = require("./browser-page-policy.cjs");

// Electron treats every partition without the `persist:` prefix as ephemeral.
// One fixed process-local name intentionally lets AiSandbox tabs share state
// during a run without ever crossing into the Human profile.
const AI_SANDBOX_PARTITION = "auris-browser-ai-sandbox";
// Human and AiShared share one persistent profile; authority still differs.
const HUMAN_PARTITION = "persist:auris-browser-human";

const AUTOMATION_MODES = Object.freeze(["Human", "AiSandbox", "AiShared"]);

function installDenyByDefaultSessionPolicy(session) {
  if (
    !session
    || typeof session.setPermissionCheckHandler !== "function"
    || typeof session.setPermissionRequestHandler !== "function"
  ) {
    throw new TypeError("Browser session permission handlers are required.");
  }
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function createPartitionContext({
  automationMode,
  createPagePolicy,
  getSession,
  partition,
  persistent,
}) {
  if (typeof getSession !== "function") {
    throw new TypeError("An Electron session resolver is required.");
  }
  const session = getSession(partition);
  if (!session) throw new TypeError(`Unable to resolve the ${automationMode} session.`);
  installDenyByDefaultSessionPolicy(session);
  const pagePolicy = createPagePolicy();
  if (!pagePolicy || typeof pagePolicy.attach !== "function") {
    throw new TypeError(`An attachable ${automationMode} page policy is required.`);
  }
  const webPreferences = Object.freeze({
    contextIsolation: true,
    nodeIntegration: false,
    partition,
    sandbox: true,
  });
  const attachedPages = new WeakMap();

  function requirePreNavigationPage(webContents) {
    if (!webContents || typeof webContents !== "object") {
      throw new TypeError(`${automationMode} webContents is required.`);
    }
    if (webContents.session !== session) {
      throw new TypeError(`${automationMode} webContents must use the selected session.`);
    }
    if (typeof webContents.getURL !== "function") {
      throw new TypeError(`${automationMode} webContents URL state is required.`);
    }
    const currentUrl = webContents.getURL();
    if (currentUrl !== "") {
      throw new TypeError(`${automationMode} page policy must attach before first navigation.`);
    }
  }

  function attachPagePolicy(webContents) {
    requirePreNavigationPage(webContents);
    if (attachedPages.has(webContents)) {
      throw new TypeError(`${automationMode} page policy is already attached.`);
    }
    const disposePolicy = pagePolicy.attach(webContents);
    if (typeof disposePolicy !== "function") {
      throw new TypeError(`${automationMode} page policy must provide cleanup.`);
    }
    let active = true;
    const record = Object.freeze({
      dispose() {
        if (!active) return;
        active = false;
        attachedPages.delete(webContents);
        disposePolicy();
      },
    });
    attachedPages.set(webContents, record);
    return record.dispose;
  }

  function isPagePolicyAttached(webContents) {
    try {
      return Boolean(
        webContents
        && typeof webContents === "object"
        && webContents.session === session
        && attachedPages.has(webContents),
      );
    } catch {
      return false;
    }
  }

  function disposePagePolicy(webContents) {
    const record = attachedPages.get(webContents);
    if (!record) return false;
    record.dispose();
    return true;
  }

  return Object.freeze({
    attachPagePolicy,
    automationMode,
    disposePagePolicy,
    isPagePolicyAttached,
    partition,
    persistent,
    session,
    webPreferences,
  });
}

function createBrowserPartitionSelector({
  createPagePolicy = createBrowserPagePolicy,
  getSession,
} = {}) {
  let humanContext = null;
  let aiSandboxContext = null;

  function select(automationMode) {
    if (!AUTOMATION_MODES.includes(automationMode)) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-automation-mode",
        automationMode,
      });
    }
    if (automationMode === "AiSandbox") {
      if (!aiSandboxContext) {
        aiSandboxContext = createPartitionContext({
          automationMode: "AiSandbox",
          createPagePolicy,
          getSession,
          partition: AI_SANDBOX_PARTITION,
          persistent: false,
        });
      }
      return aiSandboxContext;
    }
    // Human and AiShared share the persistent human profile.
    if (!humanContext) {
      humanContext = createPartitionContext({
        automationMode: "Human",
        createPagePolicy,
        getSession,
        partition: HUMAN_PARTITION,
        persistent: true,
      });
    }
    if (automationMode === "Human") return humanContext;
    return Object.freeze({
      ...humanContext,
      automationMode: "AiShared",
    });
  }

  return Object.freeze({ select });
}

module.exports = {
  AI_SANDBOX_PARTITION,
  AUTOMATION_MODES,
  HUMAN_PARTITION,
  createBrowserPartitionSelector,
  installDenyByDefaultSessionPolicy,
};
