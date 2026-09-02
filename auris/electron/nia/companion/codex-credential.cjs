"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_DEADLINE_MS = 30_000;
const EXPIRY_MARGIN_MS = 120_000;

// Secrets live only in these module-private maps. Their public handles are safe
// to pass between main-process services and contain nothing useful to a logger,
// serializer, preload bridge, or renderer.
const credentials = new WeakMap();
const realtimeSessions = new WeakMap();

function error(code, message, recovery, extra = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, recovery, ...extra }) });
}

function resolveAuthPath({ env = process.env, home = os.homedir() } = {}) {
  const configuredHome = typeof env?.CODEX_HOME === "string" && env.CODEX_HOME.length > 0
    ? env.CODEX_HOME
    : path.join(home, ".codex");
  return path.join(configuredHome, "auth.json");
}

function jwtExpiry(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof claims?.exp === "number" && Number.isFinite(claims.exp)
      ? claims.exp * 1_000
      : null;
  } catch {
    return null;
  }
}

async function readCodexCredential({
  env = process.env,
  home = os.homedir(),
  now = Date.now,
  readFile = fs.readFile,
  expiryMarginMs = EXPIRY_MARGIN_MS,
} = {}) {
  const authPath = resolveAuthPath({ env, home });
  let text;
  try {
    text = await readFile(authPath, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") {
      return error(
        "CODEX_AUTH_MISSING",
        "No Codex login is available on this machine.",
        "Run `codex` once and sign in, then wake Nia again.",
      );
    }
    return error(
      "CODEX_AUTH_UNREADABLE",
      "The Codex login could not be read.",
      "Check the Codex login file permissions, then run `codex` once.",
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return error(
      "CODEX_AUTH_MALFORMED",
      "The Codex login file is not valid JSON.",
      "Run `codex` once to refresh the local login.",
    );
  }

  const accessToken = parsed?.tokens?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return error(
      "CODEX_ACCESS_TOKEN_MISSING",
      "The Codex login contains no access token.",
      "Run `codex` once and sign in, then wake Nia again.",
    );
  }

  const expiresAtMs = jwtExpiry(accessToken);
  if (expiresAtMs !== null && expiresAtMs - expiryMarginMs <= now()) {
    return error(
      "CODEX_TOKEN_EXPIRED",
      "The Codex login has expired or is too close to expiry.",
      "Run `codex` once to refresh the login, then wake Nia again.",
      { expiredAt: new Date(expiresAtMs).toISOString() },
    );
  }

  const credential = Object.freeze({ type: "codex-oauth" });
  credentials.set(credential, { accessToken });
  return Object.freeze({
    ok: true,
    credential,
    authPath,
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    lastRefresh: typeof parsed.last_refresh === "string" ? parsed.last_refresh : null,
  });
}

async function requestWithDeadline(fetchImpl, url, init, dependencies) {
  const AbortControllerImpl = dependencies.AbortControllerImpl ?? AbortController;
  const setTimeoutImpl = dependencies.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = dependencies.clearTimeoutImpl ?? clearTimeout;
  const deadlineMs = dependencies.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const controller = new AbortControllerImpl();
  let timer;
  try {
    const pending = fetchImpl(url, { ...init, signal: controller.signal });
    timer = setTimeoutImpl(() => controller.abort(), deadlineMs);
    const response = await pending;
    return { ok: true, response };
  } catch {
    return { ok: false, timedOut: controller.signal.aborted };
  } finally {
    if (timer !== undefined) clearTimeoutImpl(timer);
  }
}

async function readBody(response) {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function exchangeRealtimeSession({
  credential,
  model = DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  deadlineMs = DEFAULT_DEADLINE_MS,
  AbortControllerImpl,
  setTimeoutImpl,
  clearTimeoutImpl,
} = {}) {
  const stored = credentials.get(credential);
  if (!stored) {
    return error(
      "CODEX_CREDENTIAL_INVALID",
      "The Codex credential handle is no longer valid.",
      "Read the Codex login again before starting Nia.",
    );
  }
  if (typeof model !== "string" || model.length === 0 || model.length > 100) {
    return error("REALTIME_MODEL_INVALID", "The Realtime model is invalid.", "Restore the default Nia voice model.");
  }

  const request = await requestWithDeadline(fetchImpl, CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stored.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session: { type: "realtime", model } }),
  }, { deadlineMs, AbortControllerImpl, setTimeoutImpl, clearTimeoutImpl });

  if (!request.ok) {
    return error(
      request.timedOut ? "CODEX_UPSTREAM_TIMEOUT" : "CODEX_UPSTREAM_UNAVAILABLE",
      request.timedOut ? "The Codex credential exchange timed out." : "The Codex credential exchange could not be reached.",
      "Check the network connection, then wake Nia again.",
    );
  }
  if (request.response.status === 401) {
    return error(
      "CODEX_CREDENTIAL_REFUSED",
      "The Realtime service refused the Codex login.",
      "Run `codex` once to refresh the login, then wake Nia again.",
      { status: 401 },
    );
  }
  if (!request.response.ok) {
    return error(
      "CODEX_SESSION_REFUSED",
      "The Realtime service refused to create a session.",
      "Try again later. If the problem continues, review Nia diagnostics.",
      { status: request.response.status },
    );
  }

  const raw = await readBody(request.response);
  let body;
  try {
    body = raw === null ? null : JSON.parse(raw);
  } catch {
    body = null;
  }
  if (typeof body?.value !== "string" || body.value.length === 0) {
    return error(
      "CODEX_SESSION_INVALID",
      "The Realtime service returned no usable session credential.",
      "Try again later. If the problem continues, review Nia diagnostics.",
    );
  }

  const session = Object.freeze({ type: "realtime-session" });
  realtimeSessions.set(session, { key: body.value, model });
  return Object.freeze({
    ok: true,
    session,
    model,
    expiresAt: typeof body.expires_at === "number" && Number.isFinite(body.expires_at)
      ? body.expires_at
      : null,
  });
}

async function proxyRealtimeSdp({
  offer,
  session,
  fetchImpl = globalThis.fetch,
  deadlineMs = DEFAULT_DEADLINE_MS,
  AbortControllerImpl,
  setTimeoutImpl,
  clearTimeoutImpl,
} = {}) {
  const stored = realtimeSessions.get(session);
  if (!stored) {
    return error(
      "REALTIME_SESSION_INVALID",
      "The Realtime session handle is no longer valid.",
      "Rest Nia, then wake her again.",
    );
  }
  if (typeof offer !== "string" || offer.length === 0) {
    return error("REALTIME_SDP_INVALID", "The WebRTC offer is invalid.", "Rest Nia, then wake her again.");
  }

  const request = await requestWithDeadline(
    fetchImpl,
    `${REALTIME_CALLS_URL}?model=${encodeURIComponent(stored.model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stored.key}`,
        "Content-Type": "application/sdp",
      },
      body: offer,
    },
    { deadlineMs, AbortControllerImpl, setTimeoutImpl, clearTimeoutImpl },
  );
  if (!request.ok) {
    return error(
      request.timedOut ? "REALTIME_SDP_TIMEOUT" : "REALTIME_SDP_UNAVAILABLE",
      request.timedOut ? "The Realtime SDP exchange timed out." : "The Realtime SDP exchange could not be reached.",
      "Check the network connection, then rest and wake Nia again.",
    );
  }

  const answer = await readBody(request.response);
  if (answer === null) {
    return error(
      "REALTIME_SDP_UNREADABLE",
      "The Realtime SDP answer could not be read.",
      "Rest Nia, then wake her again.",
    );
  }
  if (request.response.status !== 200 && request.response.status !== 201) {
    return error(
      "REALTIME_SDP_REFUSED",
      "The Realtime service refused the WebRTC offer.",
      "Rest Nia, then wake her again. If the problem continues, review Nia diagnostics.",
      { status: request.response.status },
    );
  }
  return Object.freeze({ ok: true, answer });
}

module.exports = {
  exchangeRealtimeSession,
  proxyRealtimeSdp,
  readCodexCredential,
  resolveAuthPath,
};
