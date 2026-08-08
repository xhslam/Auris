"use strict";

const { randomBytes } = require("node:crypto");
const { constants: fsConstants } = require("node:fs");
const {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rmdir,
  unlink,
  writeFile,
} = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  BrowserPublicError,
  createBrowserPublicError,
} = require("../shared/browser-contract.cjs");
const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../shared/browser-resource-budgets.cjs");
const { hashBrowserApprovalPayload } = require("./browser-approvals.cjs");

const ISOLATED_WORLD_NAME = "AurisBrowserAutomation";
const MAX_RESULT_BYTES = BROWSER_RESOURCE_BUDGETS.maxResultBytes;
const MAX_SCREENSHOT_BYTES = 16 * 1_024 * 1_024;
const MAX_EVIDENCE_FILES = BROWSER_RESOURCE_BUDGETS.maxEvidenceFiles;
const MAX_EVIDENCE_TOTAL_BYTES = BROWSER_RESOURCE_BUDGETS.maxEvidenceTotalBytes;
const MAX_CONSOLE_ENTRIES = BROWSER_RESOURCE_BUDGETS.maxConsoleEntries;
const MAX_CONSOLE_MESSAGE_LENGTH = 1_024;
const MAX_SCOPE_REFS = 4_096;
const MAX_LIFECYCLE_TOMBSTONES = 4_096;
const ADAPTER_CANCEL_GRACE_MS = 100;
const DEFAULT_ACTION_TIMEOUT_MS = 12_000;
const PAGE_SCRIPT_PATHS = Object.freeze({
  act: path.join(__dirname, "page-scripts", "act.js"),
  observe: path.join(__dirname, "page-scripts", "observe.js"),
  waitFor: path.join(__dirname, "page-scripts", "wait-for.js"),
});

let pageScriptsPromise = null;

function loadPageScripts() {
  if (!pageScriptsPromise) {
    pageScriptsPromise = Promise.all(
      Object.entries(PAGE_SCRIPT_PATHS).map(async ([name, assetPath]) => {
        const source = await readFile(assetPath, "utf8");
        if (
          source.length < 100 ||
          !/^async function auris/u.test(source.trim())
        ) {
          throw new TypeError(`Invalid fixed Browser page asset: ${name}`);
        }
        return [name, source];
      }),
    ).then((entries) => Object.freeze(Object.fromEntries(entries)));
  }
  return pageScriptsPromise;
}

function fail(code, metadata) {
  throw createBrowserPublicError(code, metadata);
}

function isAbortError(error) {
  try {
    return error?.name === "AbortError" || error?.code === "ABORT_ERR";
  } catch {
    return false;
  }
}

function rethrowMappedError(
  error,
  {
    fallbackCode = "OPERATION_NOT_ALLOWED",
    metadata,
    signal,
    webContents,
  } = {},
) {
  if (error instanceof BrowserPublicError) throw error;
  if (signal?.aborted || isAbortError(error)) fail("CANCELLED");
  let destroyed = false;
  try {
    destroyed = webContents?.isDestroyed?.() === true;
  } catch {
    destroyed = true;
  }
  if (destroyed || fallbackCode === "PAGE_CRASHED") fail("PAGE_CRASHED");
  fail(fallbackCode, metadata);
}

function isMissingFileError(error) {
  try {
    return error?.code === "ENOENT";
  } catch {
    return false;
  }
}

function safeTimeout(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 120_000)
    : DEFAULT_ACTION_TIMEOUT_MS;
}

function boundedLimit(value, fallback) {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, fallback)
    : fallback;
}

function remainingExecution(execution) {
  const timeoutMs = Number.isFinite(execution?.deadline)
    ? execution.deadline - Date.now()
    : execution?.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail("TIMEOUT");
  return { ...execution, timeoutMs: Math.max(1, Math.floor(timeoutMs)) };
}

function raceBounded(promise, { signal, timeoutMs, onCancel, onTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const rejectAfter = async (hook, error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        await hook?.();
      } catch {
        /* termination is best effort */
      }
      reject(error);
    };
    const abort = () =>
      void rejectAfter(onCancel, createBrowserPublicError("CANCELLED"));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener?.("abort", abort, { once: true });
    timer = setTimeout(() => {
      void rejectAfter(onTimeout, createBrowserPublicError("TIMEOUT"));
    }, timeoutMs);
    timer.unref?.();
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function hashBrowserExecutorPayload(request) {
  // Keep one exact canonical payload hash for style/eval so the executor never
  // trusts a caller-asserted approval for a substituted payload.
  return hashBrowserApprovalPayload(request);
}

function redactConsoleSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function redactObservedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function cdpValue(remoteObject) {
  if (Object.hasOwn(remoteObject || {}, "value")) return remoteObject.value;
  if (remoteObject?.unserializableValue === "NaN") return null;
  return undefined;
}

function createCdpRunner({ debuggerStates, ownedDebuggers }) {
  function remaining(deadline) {
    return Math.max(1, deadline - Date.now());
  }

  async function terminate(debuggerApi) {
    const termination = debuggerApi
      .sendCommand("Runtime.terminateExecution")
      .catch(() => undefined);
    await Promise.race([
      termination,
      new Promise((resolve) => {
        const timer = setTimeout(resolve, 100);
        timer.unref?.();
      }),
    ]);
  }

  async function detachOwned(webContents, state) {
    if (state) {
      state.isolatedContextId = null;
      state.isolatedScopeKey = null;
    }
    if (!state?.owned) return;
    try {
      if (webContents.debugger?.isAttached?.()) webContents.debugger.detach();
    } catch {
      // The target may already be gone.
    }
    state.owned = false;
    ownedDebuggers.delete(webContents);
  }

  async function releaseOwned(webContents, { interrupt = false } = {}) {
    let state = debuggerStates.get(webContents);
    if (!state && interrupt) {
      state = {
        activityVersion: 0,
        isolatedContextId: null,
        isolatedScopeKey: null,
        owned: false,
        queue: Promise.resolve(),
        retired: true,
      };
      debuggerStates.set(webContents, state);
    }
    if (interrupt && state) {
      state.retired = true;
      state.activityVersion += 1;
    }
    if (!state) {
      ownedDebuggers.delete(webContents);
      return;
    }
    const activityVersion = state.activityVersion;
    if (interrupt) {
      if (state.owned) {
        try {
          await terminate(webContents.debugger);
        } catch {
          /* target teardown is best effort */
        }
        await detachOwned(webContents, state);
      } else {
        ownedDebuggers.delete(webContents);
      }
      return;
    }
    const tail = state.queue;
    try {
      await tail;
    } catch {
      /* queue slots resolve, but release remains fail-safe */
    }
    if (state.activityVersion !== activityVersion) return;
    if (state.owned) await detachOwned(webContents, state);
    else ownedDebuggers.delete(webContents);
  }

  async function withDebugger(webContents, { deadline, signal }, run) {
    if (
      !webContents?.debugger?.sendCommand ||
      !webContents.debugger?.isAttached
    ) {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-isolated-world" });
    }
    let state = debuggerStates.get(webContents);
    if (!state) {
      state = {
        activityVersion: 0,
        isolatedContextId: null,
        isolatedScopeKey: null,
        owned: false,
        queue: Promise.resolve(),
        retired: false,
      };
      debuggerStates.set(webContents, state);
    }
    if (state.retired) fail("PAGE_CRASHED");
    state.activityVersion += 1;
    const previous = state.queue;
    let releaseQueue;
    state.queue = new Promise((resolve) => {
      releaseQueue = resolve;
    });
    let acquired = false;
    try {
      if (Date.now() >= deadline) fail("TIMEOUT");
      await raceBounded(previous, { signal, timeoutMs: remaining(deadline) });
      acquired = true;
      if (state.retired) fail("PAGE_CRASHED");
      if (signal?.aborted) fail("CANCELLED");
      if (Date.now() >= deadline) fail("TIMEOUT");
      if (!webContents.debugger.isAttached()) {
        webContents.debugger.attach("1.3");
        state.owned = true;
        ownedDebuggers.add(webContents);
      }
      try {
        const result = await run(webContents.debugger, state);
        if (state.retired) fail("PAGE_CRASHED");
        return result;
      } catch (error) {
        state.isolatedContextId = null;
        state.isolatedScopeKey = null;
        await detachOwned(webContents, state);
        rethrowMappedError(error, {
          fallbackCode: "PAGE_CRASHED",
          signal,
          webContents,
        });
      }
    } finally {
      if (acquired) {
        releaseQueue();
      } else {
        // Preserve FIFO exclusion even though this queued caller has already
        // timed out. Its empty slot is released only after the predecessor.
        previous.finally(releaseQueue);
      }
    }
  }

  async function isolatedRunner({
    args,
    signal,
    source,
    timeoutMs,
    webContents,
  }) {
    const deadline = Date.now() + timeoutMs;
    return withDebugger(
      webContents,
      { deadline, signal },
      async (debuggerApi, state) => {
        const command = (method, params) =>
          raceBounded(debuggerApi.sendCommand(method, params), {
            signal,
            timeoutMs: remaining(deadline),
          });
        await command("Page.enable");
        await command("Runtime.enable");
        const tree = await command("Page.getFrameTree");
        const frameId = tree?.frameTree?.frame?.id;
        if (typeof frameId !== "string" || frameId.length === 0)
          fail("PAGE_CRASHED");
        const requestedScopeKey =
          typeof args?.scopeKey === "string" ? args.scopeKey : "";
        if (state.isolatedScopeKey !== `${frameId}\u0000${requestedScopeKey}`) {
          const isolated = await command("Page.createIsolatedWorld", {
            frameId,
            grantUniveralAccess: false,
            worldName: ISOLATED_WORLD_NAME,
          });
          state.isolatedContextId = isolated?.executionContextId ?? null;
          state.isolatedScopeKey = `${frameId}\u0000${requestedScopeKey}`;
        }
        const executionContextId = state.isolatedContextId;
        if (!Number.isSafeInteger(executionContextId)) fail("PAGE_CRASHED");
        const call = debuggerApi.sendCommand("Runtime.callFunctionOn", {
          arguments: [{ value: args }],
          awaitPromise: true,
          executionContextId,
          functionDeclaration: `function(args) { return (${source})(args); }`,
          returnByValue: true,
          silent: true,
        });
        const stopExecution = () => terminate(debuggerApi);
        const response = await raceBounded(call, {
          onCancel: stopExecution,
          onTimeout: stopExecution,
          signal,
          timeoutMs: remaining(deadline),
        });
        if (response?.exceptionDetails) fail("OPERATION_NOT_ALLOWED");
        return cdpValue(response?.result);
      },
    );
  }

  async function pageWorldRunner({ signal, source, timeoutMs, webContents }) {
    const deadline = Date.now() + timeoutMs;
    return withDebugger(
      webContents,
      { deadline, signal },
      async (debuggerApi) => {
        await raceBounded(debuggerApi.sendCommand("Runtime.enable"), {
          signal,
          timeoutMs: remaining(deadline),
        });
        const evaluation = debuggerApi.sendCommand("Runtime.evaluate", {
          awaitPromise: true,
          expression: source,
          replMode: false,
          returnByValue: true,
          silent: true,
          timeout: timeoutMs,
        });
        const response = await raceBounded(evaluation, {
          onCancel: () => terminate(debuggerApi),
          onTimeout: () => terminate(debuggerApi),
          signal,
          timeoutMs: remaining(deadline),
        });
        if (response?.exceptionDetails) fail("OPERATION_NOT_ALLOWED");
        return cdpValue(response?.result);
      },
    );
  }

  return { detachOwned, isolatedRunner, pageWorldRunner, releaseOwned };
}

function ensureBoundedResult(result) {
  let serialized;
  try {
    serialized = JSON.stringify(result);
  } catch {
    fail("OPERATION_NOT_ALLOWED");
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > MAX_RESULT_BYTES
  ) {
    fail("OPERATION_NOT_ALLOWED");
  }
  const normalized = JSON.parse(serialized);
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(normalized);
}

function createBrowserPageExecutor({
  closeTarget,
  evidenceDirectory,
  focusTarget,
  getWebContents,
  isolatedRunner: injectedIsolatedRunner,
  maxActiveTargets: requestedMaxActiveTargets,
  maxEvidenceFiles: requestedMaxEvidenceFiles,
  maxEvidenceTotalBytes: requestedMaxEvidenceTotalBytes,
  maxLifecycleTombstones: requestedMaxLifecycleTombstones,
  maxScopeRefs: requestedMaxScopeRefs,
  makeEvidenceDirectory = mkdtemp,
  pageScriptLoader: injectedPageScriptLoader,
  pageWorldRunner: injectedPageWorldRunner,
  unlinkFile = unlink,
  writeEvidenceFile = writeFile,
} = {}) {
  if (typeof getWebContents !== "function") {
    throw new TypeError("A trusted Browser webContents resolver is required.");
  }
  const consoleRecords = new Map();
  const evidenceFiles = new Map();
  const issuedRefs = new Map();
  const activeScopes = new Map();
  const targetLru = new Map();
  const targetContents = new Map();
  const retiredContents = new WeakSet();
  const lifecycleTombstones = new Map();
  const debuggerStates = new WeakMap();
  const ownedDebuggers = new Set();
  let resolvedEvidenceDirectory = evidenceDirectory || null;
  let ownsEvidenceDirectory = false;
  let evidenceTotalBytes = 0;
  let evidenceDirectoryPromise = null;
  let evidenceDisposed = false;
  let evidenceQueue = Promise.resolve();
  const maxActiveTargets = boundedLimit(requestedMaxActiveTargets, 64);
  const maxEvidenceFiles = boundedLimit(
    requestedMaxEvidenceFiles,
    MAX_EVIDENCE_FILES,
  );
  const maxEvidenceTotalBytes = boundedLimit(
    requestedMaxEvidenceTotalBytes,
    MAX_EVIDENCE_TOTAL_BYTES,
  );
  const maxScopeRefs = boundedLimit(requestedMaxScopeRefs, MAX_SCOPE_REFS);
  const maxLifecycleTombstones = boundedLimit(
    requestedMaxLifecycleTombstones,
    MAX_LIFECYCLE_TOMBSTONES,
  );
  const cdp = createCdpRunner({ debuggerStates, ownedDebuggers });
  const isolatedRunner = injectedIsolatedRunner || cdp.isolatedRunner;
  const pageWorldRunner = injectedPageWorldRunner || cdp.pageWorldRunner;
  const pageScriptLoader = injectedPageScriptLoader || loadPageScripts;
  const usesDefaultIsolatedRunner = !injectedIsolatedRunner;
  const usesDefaultPageWorldRunner = !injectedPageWorldRunner;

  async function withEvidenceLock(
    run,
    { allowDisposed = false, execution } = {},
  ) {
    const previous = evidenceQueue;
    let releaseQueue;
    evidenceQueue = new Promise((resolve) => {
      releaseQueue = resolve;
    });
    let acquired = false;
    try {
      if (execution) await raceBounded(previous, remainingExecution(execution));
      else await previous;
      acquired = true;
      if (evidenceDisposed && !allowDisposed) fail("OPERATION_NOT_ALLOWED");
      if (execution?.signal?.aborted) fail("CANCELLED");
      return await run();
    } finally {
      if (acquired) releaseQueue();
      else previous.finally(releaseQueue);
    }
  }

  async function ensureEvidenceDirectory() {
    if (resolvedEvidenceDirectory) {
      await mkdir(resolvedEvidenceDirectory, { mode: 0o700, recursive: true });
      return resolvedEvidenceDirectory;
    }
    if (!evidenceDirectoryPromise) {
      const pending = (async () => {
        const created = await makeEvidenceDirectory(
          path.join(os.tmpdir(), "auris-browser-evidence-"),
        );
        resolvedEvidenceDirectory = created;
        ownsEvidenceDirectory = true;
        try {
          await chmod(created, 0o700);
        } catch (error) {
          try {
            await rmdir(created);
            resolvedEvidenceDirectory = null;
            ownsEvidenceDirectory = false;
          } catch {
            /* keep ownership so cleanup can retry */
          }
          throw error;
        }
        return created;
      })();
      evidenceDirectoryPromise = pending;
      void pending.then(
        () => {
          if (evidenceDirectoryPromise === pending)
            evidenceDirectoryPromise = null;
        },
        () => {
          if (evidenceDirectoryPromise === pending)
            evidenceDirectoryPromise = null;
        },
      );
    }
    return evidenceDirectoryPromise;
  }

  function targetKey(control) {
    return `${control.windowId}\u0000${control.tabId}`;
  }

  function tabTombstoneKey(windowId, tabId) {
    return `tab\u0000${windowId}\u0000${tabId}`;
  }

  function windowTombstoneKey(windowId) {
    return `window\u0000${windowId}`;
  }

  function rememberLifecycleTombstone(key) {
    lifecycleTombstones.delete(key);
    lifecycleTombstones.set(key, true);
    while (lifecycleTombstones.size > maxLifecycleTombstones) {
      lifecycleTombstones.delete(lifecycleTombstones.keys().next().value);
    }
  }

  function invalidateKey(
    key,
    {
      interruptDebugger = false,
      preserveLru = false,
      releaseDebugger = false,
    } = {},
  ) {
    const webContents = targetContents.get(key);
    const scope = activeScopes.get(key);
    if (scope) issuedRefs.delete(scope);
    activeScopes.delete(key);
    if (!preserveLru) targetLru.delete(key);
    const record = consoleRecords.get(key);
    if (record) {
      record.webContents.removeListener?.("console-message", record.listener);
      consoleRecords.delete(key);
    }
    if (releaseDebugger && webContents) {
      return cdp
        .releaseOwned(webContents, { interrupt: interruptDebugger })
        .finally(() => {
          if (!targetLru.has(key) && targetContents.get(key) === webContents) {
            targetContents.delete(key);
          }
        });
    }
    return undefined;
  }

  function touchTarget(control, webContents) {
    const key = targetKey(control);
    if (webContents) targetContents.set(key, webContents);
    targetLru.delete(key);
    targetLru.set(key, true);
    while (targetLru.size > maxActiveTargets) {
      const oldest = targetLru.keys().next().value;
      if (typeof oldest !== "string") break;
      void invalidateKey(oldest, { releaseDebugger: true });
    }
  }

  function scopeKey(control) {
    return `${targetKey(control)}\u0000${control.navigationGeneration}`;
  }

  function getRefAuthority(control) {
    touchTarget(control);
    const key = scopeKey(control);
    const target = targetKey(control);
    const previousScope = activeScopes.get(target);
    if (previousScope && previousScope !== key)
      issuedRefs.delete(previousScope);
    activeScopes.set(target, key);
    let authority = issuedRefs.get(key);
    if (!authority) {
      authority = { refs: new Set() };
      issuedRefs.set(key, authority);
    }
    return authority;
  }

  function assertRefScope(control, request) {
    if (request.target?.kind !== "ref") return;
    if (!getRefAuthority(control).refs.has(request.target.ref))
      fail("STALE_NAVIGATION");
  }

  function recordRefs(control, result) {
    const authority = getRefAuthority(control);
    const add = (ref) => {
      if (authority.refs.has(ref)) return;
      authority.refs.add(ref);
      while (authority.refs.size > maxScopeRefs) {
        authority.refs.delete(authority.refs.values().next().value);
      }
    };
    if (typeof result?.ref === "string") add(result.ref);
    if (Array.isArray(result?.nodes)) {
      for (const node of result.nodes) {
        if (typeof node?.ref === "string") add(node.ref);
      }
    }
  }

  function installConsoleCapture(webContents, control) {
    touchTarget(control, webContents);
    const key = targetKey(control);
    const existing = consoleRecords.get(key);
    if (
      existing?.webContents === webContents &&
      existing.navigationGeneration === control.navigationGeneration
    )
      return existing;
    if (existing)
      existing.webContents.removeListener?.(
        "console-message",
        existing.listener,
      );
    const record = {
      entries: [],
      listener: null,
      navigationGeneration: control.navigationGeneration,
      webContents,
    };
    record.listener = (_event, levelOrDetails, message, line, sourceId) => {
      const details =
        levelOrDetails && typeof levelOrDetails === "object"
          ? levelOrDetails
          : { level: levelOrDetails, lineNumber: line, message, sourceId };
      const levelMap = ["debug", "info", "warning", "error"];
      const normalizedLevel =
        typeof details.level === "string"
          ? details.level === "verbose"
            ? "debug"
            : details.level
          : levelMap[details.level] || "info";
      const entry = Object.freeze({
        level: normalizedLevel,
        line:
          Number.isSafeInteger(details.lineNumber) && details.lineNumber >= 0
            ? details.lineNumber
            : 0,
        message: String(details.message || "").slice(
          0,
          MAX_CONSOLE_MESSAGE_LENGTH,
        ),
        source: redactConsoleSource(details.sourceId),
      });
      record.entries.push(entry);
      if (record.entries.length > MAX_CONSOLE_ENTRIES) {
        record.entries.splice(0, record.entries.length - MAX_CONSOLE_ENTRIES);
      }
    };
    webContents.on?.("console-message", record.listener);
    consoleRecords.set(key, record);
    return record;
  }

  function resolveWebContents(control, tab) {
    if (
      lifecycleTombstones.has(windowTombstoneKey(control.windowId)) ||
      lifecycleTombstones.has(tabTombstoneKey(control.windowId, control.tabId))
    ) {
      fail("PAGE_CRASHED");
    }
    const webContents = getWebContents({
      tab,
      tabId: control.tabId,
      windowId: control.windowId,
    });
    if (!webContents || webContents.isDestroyed?.()) fail("PAGE_CRASHED");
    if (retiredContents.has(webContents)) fail("PAGE_CRASHED");
    installConsoleCapture(webContents, control);
    return webContents;
  }

  async function runFixed(webContents, source, args, execution) {
    const startUrl = webContents.getURL?.() || "";
    const stage = remainingExecution(execution);
    const operation = isolatedRunner({
      args,
      signal: stage.signal,
      source,
      timeoutMs: stage.timeoutMs,
      webContents,
    });
    const result = usesDefaultIsolatedRunner
      ? await operation
      : await raceBounded(operation, stage);
    const endUrl = webContents.getURL?.() || "";
    if (startUrl !== endUrl) fail("STALE_NAVIGATION");
    return ensureBoundedResult(result);
  }

  async function runNativeAdapter(adapter, input, execution) {
    const controller = new AbortController();
    const operation = Promise.resolve().then(() =>
      adapter({
        ...input,
        signal: controller.signal,
      }),
    );
    const stop = async () => {
      controller.abort();
      const observedTerminal = operation.then(
        (value) => ({ fulfilled: true, value }),
        (error) => ({ error, fulfilled: false }),
      );
      let graceTimer;
      const grace = new Promise((resolve) => {
        graceTimer = setTimeout(
          () => resolve({ fulfilled: false, graceExpired: true }),
          ADAPTER_CANCEL_GRACE_MS,
        );
        graceTimer.unref?.();
      });
      await Promise.race([observedTerminal, grace]);
      clearTimeout(graceTimer);
    };
    return raceBounded(operation, {
      ...remainingExecution(execution),
      onCancel: stop,
      onTimeout: stop,
    });
  }

  function mapPageError(result) {
    if (!result?.error) return result;
    if (result.error === "WAIT_TIMEOUT") fail("TIMEOUT");
    if (
      [
        "TARGET_DETACHED",
        "TARGET_HIDDEN",
        "TARGET_DISABLED",
        "TARGET_NOT_EDITABLE",
        "UNSAFE_STYLE",
        "UNSUPPORTED_ACTION",
      ].includes(result.error)
    ) {
      fail("OPERATION_NOT_ALLOWED");
    }
    fail("OPERATION_NOT_ALLOWED");
  }

  async function screenshot(webContents, request, control, scripts, execution) {
    let rectangle;
    if (request.target) {
      assertRefScope(control, request);
      const observed = mapPageError(
        await runFixed(
          webContents,
          scripts.observe,
          {
            generation: control.navigationGeneration,
            maxRefs: maxScopeRefs,
            mode: "query",
            scopeKey: scopeKey(control),
            target: request.target,
          },
          execution,
        ),
      );
      if (!observed?.found || observed.hidden) fail("OPERATION_NOT_ALLOWED");
      if (observed.rect?.width > 0 && observed.rect?.height > 0)
        rectangle = observed.rect;
    }
    const startUrl = webContents.getURL?.() || "";
    const image = await raceBounded(
      webContents.capturePage(rectangle),
      remainingExecution(execution),
    );
    if (startUrl !== (webContents.getURL?.() || "")) fail("STALE_NAVIGATION");
    const encoded = image?.toPNG?.();
    if (
      !Buffer.isBuffer(encoded) ||
      encoded.byteLength === 0 ||
      encoded.byteLength > MAX_SCREENSHOT_BYTES
    ) {
      fail("OPERATION_NOT_ALLOWED");
    }
    return withEvidenceLock(
      async () => {
        if (
          evidenceFiles.size >= maxEvidenceFiles ||
          evidenceTotalBytes + encoded.byteLength > maxEvidenceTotalBytes
        ) {
          fail("OPERATION_NOT_ALLOWED");
        }
        const directory = await raceBounded(
          ensureEvidenceDirectory(),
          remainingExecution(execution),
        );
        const evidenceRef = `screenshot-${randomBytes(16).toString("hex")}`;
        const filePath = path.join(directory, `${evidenceRef}.png`);
        try {
          if (execution.signal?.aborted) fail("CANCELLED");
          const writeController = new AbortController();
          const write = Promise.resolve(
            writeEvidenceFile(filePath, encoded, {
              flag:
                fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
              mode: 0o600,
              signal: writeController.signal,
            }),
          );
          const stopWrite = async () => {
            writeController.abort();
            try {
              await write;
            } catch {
              /* cleanup below handles any partial file */
            }
          };
          await raceBounded(write, {
            ...remainingExecution(execution),
            onCancel: stopWrite,
            onTimeout: stopWrite,
          });
          if (execution.signal?.aborted) fail("CANCELLED");
        } catch (error) {
          let collision = false;
          try {
            collision = error?.code === "EEXIST";
          } catch {
            collision = false;
          }
          let rollbackFailed = false;
          if (!collision) {
            try {
              await unlinkFile(filePath);
            } catch (rollbackError) {
              rollbackFailed = !isMissingFileError(rollbackError);
            }
          }
          if (!collision && rollbackFailed) {
            evidenceFiles.set(evidenceRef, {
              filePath,
              sizeBytes: encoded.byteLength,
            });
            evidenceTotalBytes += encoded.byteLength;
          }
          throw error;
        }
        evidenceFiles.set(evidenceRef, {
          filePath,
          sizeBytes: encoded.byteLength,
        });
        evidenceTotalBytes += encoded.byteLength;
        return Object.freeze({
          evidenceRef,
          mimeType: "image/png",
          sizeBytes: encoded.byteLength,
        });
      },
      { execution },
    );
  }

  async function executeInternal({
    actionTimeoutMs,
    approvedPayloadHash,
    control,
    request,
    signal,
    tab,
  } = {}) {
    if (!control || !request || !tab)
      throw new TypeError("Browser execution context is required.");
    if (signal?.aborted) fail("CANCELLED");
    if (
      tab.tabId !== control.tabId ||
      tab.navigationGeneration !== control.navigationGeneration
    ) {
      fail("STALE_NAVIGATION");
    }
    const timeoutMs = safeTimeout(actionTimeoutMs);
    const execution = { deadline: Date.now() + timeoutMs, signal, timeoutMs };
    const webContents = resolveWebContents(control, tab);
    let scripts;
    try {
      scripts = await raceBounded(
        Promise.resolve().then(() => pageScriptLoader()),
        remainingExecution(execution),
      );
    } catch (error) {
      rethrowMappedError(error, {
        fallbackCode: "CAPABILITY_NOT_VERIFIED",
        metadata: { capability: "browser-page-assets" },
        signal,
        webContents,
      });
    }

    if (request.action === "navigate") {
      const startUrl = webContents.getURL?.() || "";
      const stop = async () => {
        await webContents.stop?.();
      };
      await raceBounded(webContents.loadURL(request.url), {
        ...remainingExecution(execution),
        onCancel: stop,
        onTimeout: stop,
      });
      const finalUrl = webContents.getURL?.() || request.url;
      if (finalUrl === startUrl && finalUrl !== request.url)
        fail("NAVIGATION_BLOCKED");
      return Object.freeze({
        navigated: true,
        url: redactObservedUrl(finalUrl),
      });
    }
    if (request.action === "wait") {
      let delayTimer;
      const delay = new Promise((resolve) => {
        delayTimer = setTimeout(resolve, request.milliseconds);
        delayTimer.unref?.();
      });
      const cancelDelay = () => clearTimeout(delayTimer);
      await raceBounded(delay, {
        ...remainingExecution(execution),
        onCancel: cancelDelay,
        onTimeout: cancelDelay,
      });
      return Object.freeze({ waitedMs: request.milliseconds });
    }
    if (request.action === "wait_for") {
      assertRefScope(control, request);
      return mapPageError(
        await runFixed(
          webContents,
          scripts.waitFor,
          {
            scopeKey: scopeKey(control),
            target: request.target,
            timeoutMs: Math.min(request.timeoutMs ?? timeoutMs, timeoutMs),
          },
          execution,
        ),
      );
    }
    if (request.action === "read") {
      if (request.target) {
        assertRefScope(control, request);
        const result = mapPageError(
          await runFixed(
            webContents,
            scripts.observe,
            {
              generation: control.navigationGeneration,
              maxRefs: maxScopeRefs,
              mode: "query",
              scopeKey: scopeKey(control),
              target: request.target,
            },
            execution,
          ),
        );
        recordRefs(control, result);
        return result;
      }
      const result = await runFixed(
        webContents,
        scripts.observe,
        {
          generation: control.navigationGeneration,
          maxMarkdownChars: 200_000,
          maxNodes: 2_000,
          maxRefs: maxScopeRefs,
          maxResultBytes: MAX_RESULT_BYTES - 16_384,
          mode: "read",
          scopeKey: scopeKey(control),
        },
        execution,
      );
      const safeResult = Object.freeze({
        ...result,
        url: redactObservedUrl(webContents.getURL?.() || result?.url),
      });
      recordRefs(control, safeResult);
      return safeResult;
    }
    if (request.action === "query") {
      assertRefScope(control, request);
      const result = mapPageError(
        await runFixed(
          webContents,
          scripts.observe,
          {
            generation: control.navigationGeneration,
            maxRefs: maxScopeRefs,
            mode: "query",
            scopeKey: scopeKey(control),
            target: request.target,
          },
          execution,
        ),
      );
      recordRefs(control, result);
      return result;
    }
    if (request.action === "console") {
      const entries = installConsoleCapture(
        webContents,
        control,
      ).entries.filter(
        (entry) =>
          !request.level ||
          request.level === "all" ||
          entry.level === request.level,
      );
      return Object.freeze({
        entries: Object.freeze(entries.slice(-MAX_CONSOLE_ENTRIES)),
      });
    }
    if (request.action === "screenshot") {
      return screenshot(webContents, request, control, scripts, execution);
    }
    if (request.action === "act") {
      assertRefScope(control, request);
      return mapPageError(
        await runFixed(
          webContents,
          scripts.act,
          {
            ...request,
            scopeKey: scopeKey(control),
          },
          execution,
        ),
      );
    }
    if (request.action === "style") {
      if (approvedPayloadHash !== hashBrowserExecutorPayload(request))
        fail("PAYLOAD_MISMATCH");
      assertRefScope(control, request);
      return mapPageError(
        await runFixed(
          webContents,
          scripts.act,
          {
            css: request.css,
            scopeKey: scopeKey(control),
            target: request.target,
            variant: "style",
          },
          execution,
        ),
      );
    }
    if (request.action === "execute_js") {
      if (
        typeof request.source !== "string" ||
        request.source.length > 65_536
      ) {
        fail("OPERATION_NOT_ALLOWED");
      }
      if (approvedPayloadHash !== hashBrowserExecutorPayload(request))
        fail("PAYLOAD_MISMATCH");
      const startUrl = webContents.getURL?.() || "";
      const stage = remainingExecution(execution);
      const operation = pageWorldRunner({
        signal,
        source: request.source,
        timeoutMs: stage.timeoutMs,
        webContents,
      });
      const value = usesDefaultPageWorldRunner
        ? await operation
        : await raceBounded(operation, stage);
      if (startUrl !== (webContents.getURL?.() || "")) fail("STALE_NAVIGATION");
      return ensureBoundedResult(Object.freeze({ value }));
    }
    if (request.action === "close") {
      if (typeof closeTarget !== "function")
        fail("CAPABILITY_NOT_VERIFIED", { action: "close" });
      const closed = await runNativeAdapter(
        closeTarget,
        { control, tab },
        execution,
      );
      if (closed === true) return Object.freeze({ closed: true });
      if (closed?.closed === true) return ensureBoundedResult(closed);
      fail("OPERATION_NOT_ALLOWED");
    }
    if (request.action === "focus") {
      if (typeof focusTarget !== "function")
        fail("CAPABILITY_NOT_VERIFIED", { action: "focus" });
      return ensureBoundedResult(
        await runNativeAdapter(focusTarget, { control, tab }, execution),
      );
    }
    fail("CAPABILITY_NOT_VERIFIED", { action: request.action });
  }

  async function execute(input = {}) {
    try {
      return await executeInternal(input);
    } catch (error) {
      let webContents;
      try {
        if (input?.control && input?.tab) {
          webContents = getWebContents({
            tab: input.tab,
            tabId: input.control.tabId,
            windowId: input.control.windowId,
          });
        }
      } catch {
        webContents = null;
      }
      rethrowMappedError(error, {
        fallbackCode:
          input?.request?.action === "navigate"
            ? "NAVIGATION_BLOCKED"
            : "OPERATION_NOT_ALLOWED",
        signal: input?.signal,
        webContents,
      });
    }
  }

  async function cleanupEvidence() {
    evidenceDisposed = true;
    return withEvidenceLock(
      async () => {
        let cleanupError = null;
        const pendingDirectory = evidenceDirectoryPromise;
        if (pendingDirectory) {
          try {
            await pendingDirectory;
          } catch (error) {
            cleanupError ||= error;
          }
        }
        for (const [evidenceRef, record] of evidenceFiles) {
          try {
            await unlinkFile(record.filePath);
            evidenceFiles.delete(evidenceRef);
            evidenceTotalBytes -= record.sizeBytes;
          } catch (error) {
            if (isMissingFileError(error)) {
              evidenceFiles.delete(evidenceRef);
              evidenceTotalBytes -= record.sizeBytes;
            } else {
              cleanupError ||= error;
            }
          }
        }
        evidenceTotalBytes = Math.max(0, evidenceTotalBytes);
        if (
          ownsEvidenceDirectory &&
          resolvedEvidenceDirectory &&
          evidenceFiles.size === 0
        ) {
          try {
            await rmdir(resolvedEvidenceDirectory);
            ownsEvidenceDirectory = false;
            resolvedEvidenceDirectory = null;
          } catch (error) {
            if (isMissingFileError(error)) {
              ownsEvidenceDirectory = false;
              resolvedEvidenceDirectory = null;
            } else {
              cleanupError ||= error;
            }
          }
        }
        if (cleanupError) rethrowMappedError(cleanupError);
      },
      { allowDisposed: true },
    );
  }

  async function cleanup() {
    let evidenceError = null;
    for (const [key, record] of consoleRecords) {
      record.webContents.removeListener?.("console-message", record.listener);
      consoleRecords.delete(key);
    }
    try {
      await cleanupEvidence();
    } catch (error) {
      evidenceError = error;
    }
    for (const webContents of ownedDebuggers) {
      await cdp.detachOwned(webContents, debuggerStates.get(webContents));
    }
    issuedRefs.clear();
    activeScopes.clear();
    targetLru.clear();
    targetContents.clear();
    lifecycleTombstones.clear();
    if (evidenceError) throw evidenceError;
  }

  function invalidateTarget(windowId, tabId, options) {
    return invalidateKey(`${windowId}\u0000${tabId}`, options);
  }

  function retireTarget(windowId, tabId, { rememberKey = true } = {}) {
    if (rememberKey)
      rememberLifecycleTombstone(tabTombstoneKey(windowId, tabId));
    const webContents = targetContents.get(`${windowId}\u0000${tabId}`);
    if (webContents) retiredContents.add(webContents);
    return invalidateTarget(windowId, tabId, {
      interruptDebugger: true,
      releaseDebugger: true,
    });
  }

  return Object.freeze({
    cleanup,
    dispose: cleanup,
    execute,
    navigationChanged: (windowId, tabId) =>
      invalidateTarget(windowId, tabId, {
        preserveLru: true,
      }),
    resolveEvidencePath(evidenceRef) {
      if (
        typeof evidenceRef !== "string" ||
        !/^screenshot-[0-9a-f]{32}$/u.test(evidenceRef)
      ) {
        return null;
      }
      if (!resolvedEvidenceDirectory) return null;
      return evidenceFiles.get(evidenceRef)?.filePath ?? null;
    },
    async releaseEvidence(evidenceRef) {
      return withEvidenceLock(async () => {
        const record = evidenceFiles.get(evidenceRef);
        if (!record) return false;
        try {
          await unlinkFile(record.filePath);
        } catch (error) {
          if (!isMissingFileError(error)) rethrowMappedError(error);
        }
        evidenceFiles.delete(evidenceRef);
        evidenceTotalBytes = Math.max(0, evidenceTotalBytes - record.sizeBytes);
        return true;
      });
    },
    registerTarget({ control, tab }) {
      const webContents = resolveWebContents(control, tab);
      return () => {
        const key = targetKey(control);
        const record = consoleRecords.get(key);
        if (record?.webContents === webContents) {
          webContents.removeListener?.("console-message", record.listener);
          consoleRecords.delete(key);
        }
      };
    },
    tabClosed: retireTarget,
    async windowClosed(windowId) {
      rememberLifecycleTombstone(windowTombstoneKey(windowId));
      const releases = [];
      const keys = new Set([...targetContents.keys(), ...targetLru.keys()]);
      for (const key of keys) {
        if (!key.startsWith(`${windowId}\u0000`)) continue;
        const tabId = key.slice(windowId.length + 1);
        releases.push(retireTarget(windowId, tabId, { rememberKey: false }));
      }
      await Promise.all(releases);
    },
  });
}

module.exports = {
  ADAPTER_CANCEL_GRACE_MS,
  DEFAULT_ACTION_TIMEOUT_MS,
  ISOLATED_WORLD_NAME,
  MAX_CONSOLE_ENTRIES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_TOTAL_BYTES,
  MAX_LIFECYCLE_TOMBSTONES,
  MAX_RESULT_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCOPE_REFS,
  PAGE_SCRIPT_PATHS,
  createBrowserPageExecutor,
  hashBrowserExecutorPayload,
  redactConsoleSource,
  redactObservedUrl,
};
