"use strict";

const DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS = 120;

function createAiDockStateBuffer(options = {}) {
  const delayMs =
    typeof options.delayMs === "number" && options.delayMs >= 0
      ? options.delayMs
      : DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS;
  const onCommit =
    typeof options.onCommit === "function" ? options.onCommit : (value) => value;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let pendingState = null;
  let pendingTimer = null;

  function clearPendingTimer() {
    if (pendingTimer === null) {
      return;
    }

    clearTimeoutFn(pendingTimer);
    pendingTimer = null;
  }

  function flush() {
    clearPendingTimer();

    if (pendingState === null) {
      return null;
    }

    const nextState = pendingState;
    pendingState = null;
    return onCommit(nextState);
  }

  function schedule(nextState) {
    pendingState = nextState;
    clearPendingTimer();
    pendingTimer = setTimeoutFn(() => {
      flush();
    }, delayMs);
    return nextState;
  }

  function commit(nextState) {
    pendingState = null;
    clearPendingTimer();
    return onCommit(nextState);
  }

  function peek() {
    return pendingState;
  }

  function dispose() {
    pendingState = null;
    clearPendingTimer();
  }

  return {
    commit,
    dispose,
    flush,
    peek,
    schedule,
  };
}

module.exports = {
  createAiDockStateBuffer,
  DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS,
};
