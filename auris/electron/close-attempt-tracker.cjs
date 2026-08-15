"use strict";

/**
 * 关闭过程的可观测性与停滞检测。
 *
 * 该模块不劫持 Electron 的 quit 语义：它只把每次关闭尝试标上递增 id，记录
 * 关键里程碑，并在清理迟迟未结束时写出一条可关联的诊断日志。延迟完成的旧尝试
 * 无权结束新尝试，避免重入关闭时日志与状态相互覆盖。
 */
function createCloseAttemptTracker(options = {}) {
  const {
    log = () => {},
    now = () => Date.now(),
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    stallAfterMs = 5 * 60_000,
  } = options;
  if (typeof log !== "function" || typeof now !== "function") {
    throw new TypeError("close attempt tracker requires log() and now().");
  }
  let nextId = 1;
  let current = null;

  function clearStallTimer(attempt) {
    if (!attempt?.timer) return;
    clearTimeoutImpl(attempt.timer);
    attempt.timer = null;
  }
  function begin(reason = "before-quit") {
    if (current) return current.id;
    const attempt = {
      id: nextId,
      reason,
      startedAt: now(),
      timer: null,
    };
    nextId += 1;
    current = attempt;
    log("app:close:start", `id=${attempt.id} reason=${reason}`);
    attempt.timer = setTimeoutImpl(() => {
      if (current?.id !== attempt.id) return;
      log(
        "app:close:stalled",
        `id=${attempt.id} elapsedMs=${Math.max(0, now() - attempt.startedAt)}`,
      );
    }, stallAfterMs);
    attempt.timer?.unref?.();
    return attempt.id;
  }
  function milestone(id, name) {
    if (!current || current.id !== id) return false;
    log("app:close:milestone", `id=${id} ${name}`);
    return true;
  }
  function complete(id) {
    if (!current || current.id !== id) return false;
    const attempt = current;
    clearStallTimer(attempt);
    current = null;
    log(
      "app:close:complete",
      `id=${id} elapsedMs=${Math.max(0, now() - attempt.startedAt)}`,
    );
    return true;
  }
  function getCurrent() {
    return current
      ? { id: current.id, reason: current.reason, startedAt: current.startedAt }
      : null;
  }
  return Object.freeze({ begin, complete, getCurrent, milestone });
}

module.exports = { createCloseAttemptTracker };
