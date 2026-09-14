"use strict";

const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../shared/browser-resource-budgets.cjs");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function createBrowserHibernation({
  now = Date.now,
  maxLiveViews = BROWSER_RESOURCE_BUDGETS.maxLiveViews,
} = {}) {
  if (!Number.isSafeInteger(maxLiveViews) || maxLiveViews < 1) {
    throw new TypeError("maxLiveViews must be a positive integer.");
  }

  function serialize(tab) {
    return deepFreeze({
      automationMode: ["Human", "AiSandbox", "AiShared"].includes(
        tab?.automationMode,
      )
        ? tab.automationMode
        : "Human",
      title: typeof tab?.title === "string" ? tab.title.slice(0, 512) : "",
      url: typeof tab?.url === "string" ? tab.url.slice(0, 2_048) : "",
    });
  }

  function canHibernate(context = {}) {
    if (context.active === true) return false;
    if (context.lifecycle !== "ready") return false;
    if (context.controlled === true) return false;
    if (context.pendingApproval === true) return false;
    if (context.loading === true) return false;
    return true;
  }

  function pickVictims({ tabs = [], memoryPressure = false } = {}) {
    const candidates = (Array.isArray(tabs) ? tabs : [])
      .filter((tab) => canHibernate(tab))
      .slice()
      .sort((left, right) => {
        const leftAt = Number.isFinite(left.lastActiveAt)
          ? left.lastActiveAt
          : 0;
        const rightAt = Number.isFinite(right.lastActiveAt)
          ? right.lastActiveAt
          : 0;
        return leftAt - rightAt;
      });

    if (memoryPressure === true) {
      return Object.freeze(
        candidates.map((tab) =>
          deepFreeze({
            tabId: tab.tabId,
            windowId: tab.windowId,
          }),
        ),
      );
    }

    const liveCount = (Array.isArray(tabs) ? tabs : []).filter(
      (tab) => tab.lifecycle === "ready" || tab.lifecycle === "creating",
    ).length;
    const overflow = Math.max(0, liveCount - maxLiveViews);
    if (overflow === 0) return Object.freeze([]);
    return Object.freeze(
      candidates.slice(0, overflow).map((tab) =>
        deepFreeze({
          tabId: tab.tabId,
          windowId: tab.windowId,
        }),
      ),
    );
  }

  function markHibernatedAt() {
    return now();
  }

  return Object.freeze({
    canHibernate,
    markHibernatedAt,
    maxLiveViews,
    pickVictims,
    serialize,
  });
}

module.exports = {
  createBrowserHibernation,
};
