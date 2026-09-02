"use strict";

const crypto = require("node:crypto");

const COMMAND_CHANNEL = "auris:nia-companion:command";
const EVENT_CHANNEL = "auris:nia-companion:event";
const REPORT_CHANNEL = "auris:nia-companion:report";
const HOST_COMMAND_CHANNEL = "shadowing:nia-companion:host-command";
const HOST_EVENT_CHANNEL = "shadowing:nia-companion:host-event";
const MAX_SESSION_HANDLES = 4;
const MAX_OFFER_LENGTH = 200_000;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function randomHandle() {
  return crypto.randomBytes(24).toString("base64url");
}

function createCompanionIpc({
  ipcMain,
  companionWindow,
  isTrustedSender,
  readCredential,
  exchangeRealtimeSession,
  proxyRealtimeSdp,
  getSnapshot = () => ({}),
  onReport = () => undefined,
  onReady = () => undefined,
  onOpenNia = () => undefined,
  onWake = () => undefined,
} = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.on !== "function") {
    throw new TypeError("ipcMain is required.");
  }
  if (!companionWindow || typeof companionWindow.window !== "function") {
    throw new TypeError("Companion window is required.");
  }
  if (typeof isTrustedSender !== "function") throw new TypeError("A companion sender validator is required.");
  if (typeof readCredential !== "function" || typeof exchangeRealtimeSession !== "function" || typeof proxyRealtimeSdp !== "function") {
    throw new TypeError("Realtime credential functions are required.");
  }

  const sessionHandles = new Map();
  let registered = false;

  function senderIsCompanion(event) {
    try { return isTrustedSender(event); } catch { return false; }
  }

  function send(event) {
    const target = companionWindow.window();
    if (!target || target.isDestroyed?.()) return false;
    target.webContents?.send?.(EVENT_CHANNEL, event);
    return true;
  }

  function pruneHandles() {
    const now = Date.now();
    for (const [token, entry] of sessionHandles) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) sessionHandles.delete(token);
    }
    while (sessionHandles.size > MAX_SESSION_HANDLES) {
      sessionHandles.delete(sessionHandles.keys().next().value);
    }
  }

  async function openSession(payload = {}) {
    const auth = await readCredential();
    if (!auth?.ok) return auth;
    const result = await exchangeRealtimeSession({ credential: auth.credential });
    if (!result?.ok) return result;
    pruneHandles();
    const handle = randomHandle();
    const expiresAt = Number.isFinite(result.expiresAt)
      ? (result.expiresAt < 1_000_000_000_000 ? result.expiresAt * 1_000 : result.expiresAt)
      : null;
    sessionHandles.set(handle, { session: result.session, expiresAt });
    pruneHandles();
    return Object.freeze({ ok: true, sessionId: handle, expiresAt, model: result.model });
  }

  async function handleCommand(event, request = {}) {
    if (!senderIsCompanion(event) || !isRecord(request)) throw new Error("Untrusted Nia companion request.");
    const command = typeof request.command === "string" ? request.command : "";
    const payload = isRecord(request.payload) ? request.payload : {};
    if (command === "snapshot") return getSnapshot();
    if (command === "open-session") return openSession(payload);
    if (command === "sdp") {
      const token = typeof payload.sessionId === "string" ? payload.sessionId : "";
      const offer = typeof payload.offer === "string" ? payload.offer : "";
      if (!token || offer.length === 0 || offer.length > MAX_OFFER_LENGTH) {
        return { ok: false, error: { code: "REALTIME_SDP_INVALID", message: "The WebRTC offer is invalid." } };
      }
      const entry = sessionHandles.get(token);
      if (!entry) return { ok: false, error: { code: "REALTIME_SESSION_INVALID", message: "The Realtime session handle is no longer valid." } };
      const result = await proxyRealtimeSdp({ offer, session: entry.session });
      if (!result?.ok) sessionHandles.delete(token);
      return result;
    }
    if (command === "pointer-capture") {
      return companionWindow.setPointerCapture?.(payload.enabled === true) ?? false;
    }
    if (command === "drag-begin") {
      return companionWindow.beginDrag?.({ x: Number(payload.x), y: Number(payload.y) }) ?? false;
    }
    if (command === "drag-to") {
      return companionWindow.dragTo?.({ x: Number(payload.x), y: Number(payload.y) }) ?? false;
    }
    if (command === "drag-end") return companionWindow.endDrag?.() ?? false;
    if (command === "open-nia") return onOpenNia();
    if (command === "wake") return onWake();
    throw new TypeError("Unsupported Nia companion command.");
  }

  function handleReport(event, report) {
    if (!senderIsCompanion(event) || !isRecord(report)) return false;
    try { onReport(report); } catch { /* reports are observational and must not crash main */ }
    return true;
  }

  function handleReady(event, payload) {
    if (!senderIsCompanion(event)) return false;
    try { onReady(isRecord(payload) ? payload : {}); } catch { /* best effort */ }
    return true;
  }

  function register() {
    if (registered) return;
    registered = true;
    ipcMain.handle(COMMAND_CHANNEL, handleCommand);
    ipcMain.on(REPORT_CHANNEL, handleReport);
    ipcMain.on(`${REPORT_CHANNEL}:ready`, handleReady);
  }

  function dispose() {
    if (!registered) return;
    registered = false;
    ipcMain.removeHandler?.(COMMAND_CHANNEL);
    ipcMain.removeListener?.(REPORT_CHANNEL, handleReport);
    ipcMain.removeListener?.(`${REPORT_CHANNEL}:ready`, handleReady);
    sessionHandles.clear();
  }

  return Object.freeze({
    channels: Object.freeze({ COMMAND_CHANNEL, EVENT_CHANNEL, REPORT_CHANNEL }),
    dispose,
    register,
    send,
    sessionCount: () => sessionHandles.size,
  });
}

module.exports = {
  COMMAND_CHANNEL,
  EVENT_CHANNEL,
  HOST_COMMAND_CHANNEL,
  HOST_EVENT_CHANNEL,
  REPORT_CHANNEL,
  createCompanionIpc,
};
