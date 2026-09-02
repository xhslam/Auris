"use strict";

const DEFAULT_ROTATION_LEAD_MS = 5 * 60_000;
const MAX_PENDING_TEXT = 1;

function createRealtimeCoordinator({
  credentialBroker,
  transport,
  conversation,
  diagnostics,
  now = Date.now,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  rotationLeadMs = DEFAULT_ROTATION_LEAD_MS,
  personaId = "nia",
} = {}) {
  if (!credentialBroker || typeof credentialBroker.read !== "function") throw new TypeError("Credential broker is required.");
  if (!transport || typeof transport.send !== "function") throw new TypeError("A companion transport is required.");
  if (!conversation || typeof conversation.file !== "function") throw new TypeError("Conversation lifecycle is required.");
  if (typeof now !== "function") throw new TypeError("Coordinator clock must be a function.");
  let generation = 0;
  let state = "resting";
  let sessionId = null;
  let expiresAt = null;
  let conversationId = null;
  let pendingText = null;
  let pendingReminder = null;
  let muted = false;
  let rotationTimer = null;
  let disposed = false;
  let lastConfig = null;
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({
      conversationId,
      expiresAt,
      generation,
      muted,
      pendingReminder,
      pendingText: pendingText !== null,
      sessionId,
      state,
    });
  }

  function publish() {
    const value = snapshot();
    for (const listener of [...listeners]) {
      try { listener(value); } catch { /* UI listeners are not authoritative. */ }
    }
    return value;
  }

  function note(code, message, recovery, detail) {
    try { diagnostics?.note?.({ component: "coordinator", code, message, recovery, detail }); } catch { /* diagnostics are passive */ }
  }

  function cancelRotation() {
    if (rotationTimer !== null) clearTimeoutImpl(rotationTimer);
    rotationTimer = null;
  }

  function armRotation(at) {
    cancelRotation();
    if (!Number.isFinite(at)) return;
    const delay = Math.max(0, at - now() - rotationLeadMs);
    const expected = generation;
    rotationTimer = setTimeoutImpl(() => {
      rotationTimer = null;
      if (disposed || generation !== expected || state === "resting") return;
      void rotate(expected);
    }, delay);
  }

  async function rotate(expectedGeneration) {
    if (disposed || generation !== expectedGeneration || state === "resting") return false;
    const previous = sessionId;
    const result = await open({ reason: "rotate", replace: true });
    if (!result || generation === expectedGeneration || !sessionId) return false;
    try { transport.send({ type: "close", generation: expectedGeneration, reason: "rotated" }); } catch { /* renderer may be closing */ }
    if (previous && previous === sessionId) note("REALTIME_ROTATION_STALLED", "Realtime rotation did not replace the old session.", "Rest Nia, then wake her again.");
    return true;
  }

  async function open({ reason = "wake", replace = false } = {}) {
    if (disposed) return false;
    if (!replace && ["opening", "listening", "attending", "thinking", "speaking", "working"].includes(state)) return true;
    const requested = ++generation;
    state = "opening";
    sessionId = null;
    expiresAt = null;
    publish();
    const auth = await credentialBroker.read();
    if (disposed || requested !== generation) return false;
    if (!auth?.ok) {
      state = "failed";
      note(auth?.error?.code ?? "CODEX_AUTH_UNAVAILABLE", auth?.error?.message ?? "Codex login unavailable.", auth?.error?.recovery ?? "Run codex, then wake Nia again.");
      publish();
      return false;
    }
    try {
      transport.send({ type: "open", generation: requested, reason, credential: auth.credential, personaId });
    } catch (error) {
      state = "failed";
      note("REALTIME_TRANSPORT_UNAVAILABLE", "The Nia companion renderer is unavailable.", "Show Nia again, then wake her.", { message: error instanceof Error ? error.message : String(error) });
      publish();
      return false;
    }
    return true;
  }

  function report(report) {
    if (disposed || !report || report.generation !== generation) return false;
    switch (report.type) {
      case "opened":
        sessionId = typeof report.sessionId === "string" ? report.sessionId : null;
        expiresAt = Number.isFinite(report.expiresAt) ? report.expiresAt : null;
        state = "listening";
        if (muted) transport.send({ type: "mute", generation, muted: true });
        armRotation(expiresAt);
        break;
      case "state":
        if (["listening", "attending", "thinking", "speaking", "working", "resting", "failed"].includes(report.state)) state = report.state;
        break;
      case "heard":
        conversation.file("user", report.text ?? "", { at: report.at, responseId: report.responseId, itemId: report.itemId });
        break;
      case "said":
        conversation.file("nia", report.text ?? "", { at: report.at, cut: report.cut === true, responseId: report.responseId, itemId: report.itemId });
        break;
      case "tool":
        conversation.tool(report.name, report.callId, report.status ?? "arrived", report.at ?? now());
        break;
      case "closed":
        cancelRotation();
        if (conversation.isLive?.()) conversation.end(report.at ?? now());
        sessionId = null;
        expiresAt = null;
        state = "resting";
        break;
      case "failed":
        state = "failed";
        note(report.code ?? "REALTIME_FAILED", report.message ?? "Realtime failed.", report.recovery ?? "Rest Nia, then wake her again.", report.detail);
        break;
      default:
        return false;
    }
    if (pendingText !== null && state === "listening" && report.type === "opened") {
      const text = pendingText;
      pendingText = null;
      transport.send({ type: "text", generation, text });
    }
    return publish();
  }

  function sendText(text) {
    if (typeof text !== "string" || text.trim() === "") return false;
    if (pendingText !== null) return false;
    if (state === "resting" || state === "failed") pendingText = text.trim().slice(0, 20_000);
    else if (state === "listening") transport.send({ type: "text", generation, text: text.trim().slice(0, 20_000) });
    else pendingText = text.trim().slice(0, 20_000);
    if (state === "resting" || state === "failed") void open({ reason: "typed-message" });
    publish();
    return true;
  }

  function queueReminder(reminder) {
    if (!reminder || typeof reminder !== "object") return false;
    pendingReminder = Object.freeze({ count: Number(reminder.count) || 0, items: Array.isArray(reminder.items) ? reminder.items.slice(0, 32) : [] });
    if (state === "listening") transport.send({ type: "reminder", generation, reminder: pendingReminder });
    publish();
    return true;
  }

  function setConfig(config) {
    lastConfig = config && typeof config === "object" ? { ...config } : null;
    if (state === "listening") transport.send({ type: "config", generation, config: lastConfig });
  }

  function setMuted(value) {
    muted = value === true;
    if (state !== "resting") transport.send({ type: "mute", generation, muted });
    publish();
    return muted;
  }

  function rest(reason = "user") {
    if (disposed) return;
    cancelRotation();
    const oldGeneration = generation;
    generation += 1;
    try { transport.send({ type: "close", generation: oldGeneration, reason }); } catch { /* best effort */ }
    if (conversation.isLive?.()) conversation.end(now());
    sessionId = null;
    expiresAt = null;
    pendingText = null;
    pendingReminder = null;
    muted = false;
    state = "resting";
    publish();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelRotation();
    try { transport.send({ type: "close", generation, reason: "quit" }); } catch { /* best effort */ }
    if (conversation.isLive?.()) conversation.end(now());
    listeners.clear();
    lastConfig = null;
  }

  return Object.freeze({ dispose, open, queueReminder, report, rest, sendText, setConfig, setMuted, snapshot, subscribe, wake: open });
}

module.exports = { createRealtimeCoordinator, DEFAULT_ROTATION_LEAD_MS };
