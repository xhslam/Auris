"use strict";

function createBrowserIdFactory() {
  let nextWindow = 1;
  let nextTab = 1;

  return Object.freeze({
    nextTabId() {
      const id = `browser-tab-${nextTab}`;
      nextTab += 1;
      return id;
    },
    nextWindowId() {
      const id = `browser-window-${nextWindow}`;
      nextWindow += 1;
      return id;
    },
  });
}

module.exports = { createBrowserIdFactory };
