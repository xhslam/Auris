"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { createBrowserPublicError } = require("../shared/browser-contract.cjs");

const SESSION_NAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;
const SESSION_STORAGE_SCRIPT = fsSync.readFileSync(
  path.join(__dirname, "page-scripts", "session-storage.js"),
  "utf8",
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError();
    return url.origin;
  } catch {
    throw createBrowserPublicError("NO_COMMITTED_ORIGIN");
  }
}

function validateSessionName(name) {
  if (typeof name !== "string" || !SESSION_NAME_PATTERN.test(name)) {
    throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
      capability: "session-name",
    });
  }
  return name;
}

function cookieCoversHost(cookieDomain, host) {
  const domain = String(cookieDomain || "").replace(/^\./u, "").toLowerCase();
  const target = String(host || "").toLowerCase();
  if (!domain || !target) return false;
  return target === domain || target.endsWith(`.${domain}`);
}

function sameSiteForElectron(value) {
  if (value == null || value === "") return "unspecified";
  const normalized = String(value).toLowerCase();
  if (normalized === "strict" || normalized === "lax" || normalized === "no_restriction" || normalized === "none") {
    return normalized === "none" ? "no_restriction" : normalized;
  }
  return "unspecified";
}

function createBrowserSessionService({
  capabilities,
  database,
  now = () => new Date().toISOString(),
  runIsolatedStorageScript,
  secretStore,
  getCookies,
  setCookie,
  removeCookie,
} = {}) {
  if (!capabilities || typeof capabilities.assertSaveAllowed !== "function") {
    throw new TypeError("Browser session capabilities are required.");
  }
  if (!secretStore || typeof secretStore.encrypt !== "function") {
    throw new TypeError("A Keychain secret store is required.");
  }
  if (!database || typeof database.prepare !== "function") {
    throw new TypeError("A browser state database is required.");
  }
  if (typeof runIsolatedStorageScript !== "function") {
    throw new TypeError("An isolated storage script runner is required.");
  }
  if (typeof getCookies !== "function" || typeof setCookie !== "function") {
    throw new TypeError("Trusted Electron cookie adapters are required.");
  }

  const upsertStatement = database.prepare(`
    INSERT INTO browser_session_refs (
      name, origin, ciphertext, cookie_count, origin_count,
      local_storage_item_count, created_at, updated_at
    ) VALUES (
      :name, :origin, :ciphertext, :cookie_count, :origin_count,
      :local_storage_item_count, :created_at, :updated_at
    )
    ON CONFLICT(name) DO UPDATE SET
      origin = excluded.origin,
      ciphertext = excluded.ciphertext,
      cookie_count = excluded.cookie_count,
      origin_count = excluded.origin_count,
      local_storage_item_count = excluded.local_storage_item_count,
      updated_at = excluded.updated_at;
  `);
  const loadStatement = database.prepare(`
    SELECT name, origin, ciphertext, cookie_count, origin_count, local_storage_item_count
    FROM browser_session_refs WHERE name = ?;
  `);
  const deleteStatement = database.prepare(
    "DELETE FROM browser_session_refs WHERE name = ?;",
  );
  const countStatement = database.prepare(
    "SELECT COUNT(*) AS total FROM browser_session_refs;",
  );

  const sessionInjectedTabs = new Set();

  function tabKey(windowId, tabId) {
    return `${windowId}\u0000${tabId}`;
  }

  function markTabSessionInjected(windowId, tabId) {
    sessionInjectedTabs.add(tabKey(windowId, tabId));
  }

  function clearTabSessionInjected(windowId, tabId) {
    sessionInjectedTabs.delete(tabKey(windowId, tabId));
  }

  function isSessionInjected(windowId, tabId) {
    return sessionInjectedTabs.has(tabKey(windowId, tabId));
  }

  function redactedSummary(payload) {
    const localStorageItemCount = (payload.origins || []).reduce(
      (total, entry) => total + (entry.items?.length || 0),
      0,
    );
    return deepFreeze({
      capabilities: capabilities.snapshot(),
      cookieCount: (payload.cookies || []).length,
      localStorageItemCount,
      name: payload.name,
      originCount: (payload.origins || []).length,
    });
  }

  function encodePayload(payload) {
    const json = JSON.stringify(payload);
    return secretStore.encrypt(Buffer.from(json, "utf8"));
  }

  function decodePayload(ciphertext) {
    let json;
    try {
      json = secretStore.decrypt(ciphertext).toString("utf8");
    } catch (error) {
      if (error?.code === "CAPABILITY_NOT_VERIFIED") throw error;
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "session-ciphertext",
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "session-ciphertext",
      });
    }
    if (!parsed || typeof parsed !== "object") {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "session-ciphertext",
      });
    }
    return parsed;
  }

  function ensureSameOrigin(committedOrigin, payload) {
    const here = normalizeOrigin(committedOrigin);
    if (payload.origin) {
      if (normalizeOrigin(payload.origin) !== here) {
        throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
          capability: "session-origin-binding",
        });
      }
    } else if ((payload.cookies || []).length > 0) {
      throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
        capability: "session-unscoped-cookies",
      });
    }
    for (const entry of payload.origins || []) {
      if (normalizeOrigin(entry.origin) !== here) {
        throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
          capability: "session-origin-binding",
        });
      }
    }
  }

  async function captureCookies({ origin, partitionSession }) {
    if (!capabilities.canCaptureCookies()) return [];
    const host = new URL(origin).hostname;
    const cookies = await getCookies({ partitionSession, url: origin });
    const list = Array.isArray(cookies) ? cookies : [];
    return list
      .filter((cookie) => cookieCoversHost(cookie.domain, host))
      .map((cookie) => ({
        domain: String(cookie.domain || ""),
        expirationDate: Number.isFinite(cookie.expirationDate)
          ? cookie.expirationDate
          : undefined,
        hostOnly: cookie.hostOnly === true,
        httpOnly: cookie.httpOnly === true,
        name: String(cookie.name || ""),
        path: String(cookie.path || "/"),
        sameSite: cookie.sameSite,
        secure: cookie.secure === true,
        value: String(cookie.value || ""),
      }))
      .filter((cookie) => cookie.name.length > 0);
  }

  async function captureLocalStorage({ origin, runContext }) {
    if (!capabilities.canCaptureLocalStorage()) {
      return [];
    }
    const result = await runIsolatedStorageScript({
      ...runContext,
      args: { expectedOrigin: origin, mode: "capture" },
      source: SESSION_STORAGE_SCRIPT,
    });
    if (!result || result.ok !== true || !Array.isArray(result.items)) {
      throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
        capability: "session-local-storage-capture",
      });
    }
    const items = result.items
      .filter((pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string")
      .map((pair) => [pair[0], pair[1]]);
    return items.length > 0 ? [{ origin, items }] : [];
  }

  async function save({
    name: nameInput,
    committedOrigin,
    partitionSession,
    runContext,
    revalidate,
  }) {
    capabilities.assertSaveAllowed();
    const name = validateSessionName(nameInput);
    const origin = normalizeOrigin(committedOrigin);
    const cookies = await captureCookies({ origin, partitionSession });
    const origins = await captureLocalStorage({ origin, runContext });
    if (typeof revalidate === "function") {
      const stillFresh = await revalidate();
      if (stillFresh !== true) {
        throw createBrowserPublicError("CONTROL_STALE", {
          capability: "session-save-freshness",
        });
      }
    }
    if (cookies.length === 0 && origins.length === 0) {
      throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
        capability: "session-empty-capture",
      });
    }
    const payload = {
      cookies,
      name,
      origin,
      origins,
    };
    const ciphertext = encodePayload(payload);
    const timestamp = now();
    const existing = loadStatement.get(name);
    upsertStatement.run({
      ciphertext,
      cookie_count: cookies.length,
      created_at: existing?.created_at || timestamp,
      local_storage_item_count: origins.reduce(
        (total, entry) => total + entry.items.length,
        0,
      ),
      name,
      origin,
      origin_count: origins.length,
      updated_at: timestamp,
    });
    return redactedSummary(payload);
  }

  async function restoreCookies({ origin, partitionSession, cookies }) {
    const host = new URL(origin).hostname;
    for (const cookie of cookies) {
      if (!cookieCoversHost(cookie.domain, host)) {
        throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
          capability: "session-cookie-domain",
        });
      }
      // Electron can set httpOnly. If a future platform cannot, refuse rather than weaken.
      if (cookie.httpOnly === true && typeof setCookie !== "function") {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          capability: "http-only-cookie-replay",
        });
      }
      const details = {
        domain: cookie.domain,
        httpOnly: cookie.httpOnly === true,
        name: cookie.name,
        path: cookie.path || "/",
        sameSite: sameSiteForElectron(cookie.sameSite),
        secure: cookie.secure === true,
        url: origin,
        value: cookie.value,
      };
      if (cookie.hostOnly === true) {
        details.domain = host;
      }
      if (Number.isFinite(cookie.expirationDate)) {
        details.expirationDate = cookie.expirationDate;
      }
      await setCookie({ cookie: details, partitionSession });
    }
  }

  async function restoreLocalStorage({ origin, runContext, origins }) {
    const items = origins.flatMap((entry) => entry.items || []);
    if (items.length === 0) return;
    const result = await runIsolatedStorageScript({
      ...runContext,
      args: { expectedOrigin: origin, items, mode: "restore" },
      source: SESSION_STORAGE_SCRIPT,
    });
    if (!result || result.ok !== true) {
      throw createBrowserPublicError("OPERATION_NOT_ALLOWED", {
        capability: "session-local-storage-restore",
        ...(result?.reason ? { reason: result.reason } : {}),
      });
    }
  }

  async function load({
    name: nameInput,
    committedOrigin,
    partitionSession,
    runContext,
    revalidate,
    windowId,
    tabId,
  }) {
    const name = validateSessionName(nameInput);
    const row = loadStatement.get(name);
    if (!row) {
      throw createBrowserPublicError("SESSION_NOT_FOUND", { name });
    }
    const payload = decodePayload(row.ciphertext);
    payload.name = name;
    capabilities.assertLoadAllowed({
      hasCookies: (payload.cookies || []).length > 0,
      hasLocalStorage: (payload.origins || []).some(
        (entry) => (entry.items || []).length > 0,
      ),
    });
    if (typeof revalidate === "function") {
      const stillFresh = await revalidate();
      if (stillFresh !== true) {
        throw createBrowserPublicError("CONTROL_STALE", {
          capability: "session-load-freshness",
        });
      }
    }
    const origin = normalizeOrigin(committedOrigin);
    ensureSameOrigin(origin, payload);

    const cookies = capabilities.canCaptureCookies() ? (payload.cookies || []) : [];
    const origins = capabilities.canCaptureLocalStorage() ? (payload.origins || []) : [];
    // Refuse partial restore when the blob needs a disabled capability.
    capabilities.assertLoadAllowed({
      hasCookies: (payload.cookies || []).length > 0,
      hasLocalStorage: (payload.origins || []).some(
        (entry) => (entry.items || []).length > 0,
      ),
    });

    if (cookies.length > 0) {
      await restoreCookies({ cookies, origin, partitionSession });
    }
    if (origins.length > 0) {
      await restoreLocalStorage({ origin, origins, runContext });
    }
    if (windowId && tabId) {
      markTabSessionInjected(windowId, tabId);
    }
    return deepFreeze({
      capabilities: capabilities.snapshot(),
      loaded: true,
      name,
    });
  }

  function forget(nameInput) {
    const name = validateSessionName(nameInput);
    deleteStatement.run(name);
    return Object.freeze({ forgotten: true, name });
  }

  function exists(nameInput) {
    const name = validateSessionName(nameInput);
    return Boolean(loadStatement.get(name));
  }

  function inspect(nameInput) {
    const name = validateSessionName(nameInput);
    const row = loadStatement.get(name);
    if (!row) return null;
    return deepFreeze({
      capabilities: capabilities.snapshot(),
      cookieCount: row.cookie_count,
      localStorageItemCount: row.local_storage_item_count,
      name: row.name,
      origin: row.origin,
      originCount: row.origin_count,
    });
  }

  function storedCount() {
    return Number(countStatement.get()?.total || 0);
  }

  /** Test/helper: never expose decrypted values outside process. */
  function readCiphertextOnly(nameInput) {
    const name = validateSessionName(nameInput);
    const row = loadStatement.get(name);
    if (!row) return null;
    return Buffer.from(row.ciphertext);
  }

  return Object.freeze({
    clearTabSessionInjected,
    exists,
    forget,
    inspect,
    isSessionInjected,
    load,
    markTabSessionInjected,
    readCiphertextOnly,
    save,
    SESSION_STORAGE_SCRIPT,
    storedCount,
  });
}

module.exports = {
  SESSION_NAME_PATTERN,
  createBrowserSessionService,
};
