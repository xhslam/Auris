"use strict";

const {
  BrowserPublicError,
  browserActionRequestSchema,
  createBrowserPublicError,
} = require("../shared/browser-contract.cjs");
const {
  createBrowserApprovalManager,
} = require("./browser-approvals.cjs");
const { createBrowserGrantManager } = require("./browser-grants.cjs");
const { createBrowserLeaseManager } = require("./browser-lease.cjs");
const { createBrowserNavigationPolicy } = require("./browser-navigation-policy.cjs");
const { createBrowserOperationGuard } = require("./browser-operation-guard.cjs");
const { resolveOwnerKindFromConnectionId } = require("./browser-owner-kind.cjs");

function fail(code, metadata) {
  throw createBrowserPublicError(code, metadata);
}

function assertNotCancelled(signal) {
  if (signal?.aborted === true) fail("CANCELLED");
}

function redactUrl(value) {
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

function safeTarget(windowId, tab) {
  const title = typeof tab.title === "string"
    && tab.title.length <= 512
    && !/\p{Cc}/u.test(tab.title)
    ? tab.title
    : "";
  return Object.freeze({
    tabId: tab.tabId,
    title,
    url: redactUrl(tab.url),
    windowId,
  });
}

function createBrowserCommandDispatcher({
  approvals = null,
  audit = null,
  capabilities = null,
  createAiSandboxTarget,
  destroyTarget,
  executor = null,
  getCurrentControlEpoch = ({ tab }) => tab.controlEpoch,
  grants = createBrowserGrantManager(),
  leases = createBrowserLeaseManager(),
  navigationPolicy = createBrowserNavigationPolicy({ allowLoopback: true }),
  operationGuard = null,
  partitionSelector,
  registry,
  sessionCapabilities = null,
  sessionService = null,
} = {}) {
  const approvalManager = approvals || createBrowserApprovalManager({ grants });
  if (
    !registry
    || typeof registry.snapshot !== "function"
    || typeof registry.closeTab !== "function"
  ) {
    throw new TypeError("A Browser registry with closeTab authority is required.");
  }
  if (!partitionSelector || typeof partitionSelector.select !== "function") {
    throw new TypeError("A Browser partition selector is required.");
  }
  if (typeof createAiSandboxTarget !== "function") {
    throw new TypeError("An AiSandbox target factory is required.");
  }
  if (typeof destroyTarget !== "function") {
    throw new TypeError("A Browser target cleanup function is required.");
  }
  if (typeof getCurrentControlEpoch !== "function") {
    throw new TypeError("A trusted Browser control-epoch source is required.");
  }
  if (
    !approvalManager
    || typeof approvalManager.request !== "function"
    || typeof approvalManager.consume !== "function"
  ) {
    throw new TypeError("A main-owned Browser approval manager is required.");
  }
  if (!grants || typeof grants.hasStandingGrant !== "function") {
    throw new TypeError("A main-owned Browser grant manager is required.");
  }
  const guard = operationGuard || createBrowserOperationGuard({
    approvals: approvalManager,
    audit,
    getCurrentControlEpoch,
    grants,
    leases,
    navigationPolicy,
    registry,
  });
  if (!guard || typeof guard.authorize !== "function") {
    throw new TypeError("A Browser operation guard is required.");
  }

  function readCurrentControlEpoch(windowId, tab) {
    const controlEpoch = getCurrentControlEpoch({
      tab,
      tabId: tab.tabId,
      windowId,
    });
    if (!Number.isSafeInteger(controlEpoch) || controlEpoch < 0) {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-control-source" });
    }
    return controlEpoch;
  }

  function explicitLifecycleControlEpoch(value) {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("A nonnegative Browser control epoch is required.");
    }
    return value;
  }

  function getTarget(windowId, tabId) {
    const window = registry.getWindow(windowId);
    if (!window) fail("WINDOW_NOT_FOUND", { windowId });
    const tab = registry.getTab(windowId, tabId);
    if (!tab) fail("TAB_NOT_FOUND", { tabId, windowId });
    return tab;
  }

  function listSafeTargets() {
    return registry.snapshot().windows.flatMap((window) =>
      window.tabs.map((tab) => safeTarget(window.windowId, tab)),
    );
  }

  function eligibleTargets(connectionId) {
    return registry.snapshot().windows.flatMap((window) => window.tabs
      .filter((tab) =>
        (tab.lifecycle === "ready" || tab.lifecycle === "creating")
        && leases.canAcquire(connectionId, window.windowId, tab.tabId),
      )
      .map((tab) => ({ tab, windowId: window.windowId })));
  }

  function assertKnownAutomationMode(tab) {
    if (!["Human", "AiSandbox", "AiShared"].includes(tab.automationMode)) {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-automation-mode" });
    }
  }

  function acquire(connectionId, windowId, tab) {
    assertKnownAutomationMode(tab);
    if (tab.lifecycle !== "ready" && tab.lifecycle !== "creating") {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-tab-lifecycle" });
    }
    const control = leases.acquire({
      connectionId,
      controlEpoch: readCurrentControlEpoch(windowId, tab),
      navigationGeneration: tab.navigationGeneration,
      ownerKind: resolveOwnerKindFromConnectionId(connectionId),
      tabId: tab.tabId,
      windowId,
    });
    approvalManager.controlChanged?.(windowId, tab.tabId);
    grants.controlChanged?.(windowId, tab.tabId);
    return Object.freeze({ control, target: safeTarget(windowId, tab) });
  }

  function resolveAcquireTarget(connectionId, target) {
    if (target) {
      return { tab: getTarget(target.windowId, target.tabId), windowId: target.windowId };
    }
    const candidates = eligibleTargets(connectionId);
    if (candidates.length === 0) fail("TAB_NOT_FOUND");
    if (candidates.length > 1) {
      fail("AMBIGUOUS_TARGET", {
        targets: candidates.map(({ tab, windowId }) => safeTarget(windowId, tab)),
      });
    }
    return candidates[0];
  }

  function assertControl(connectionId, control) {
    if (!control || typeof control !== "object") fail("LEASE_LOST");
    const tab = getTarget(control.windowId, control.tabId);
    const sourceControlEpoch = readCurrentControlEpoch(control.windowId, tab);
    const lease = leases.assertCurrent({ ...control, connectionId }, {
      currentControlEpoch: sourceControlEpoch,
      currentNavigationGeneration: tab.navigationGeneration,
    });
    return { lease, sourceControlEpoch, tab };
  }

  function isControlInvalidated(connectionId, control) {
    try {
      leases.assert({ ...control, connectionId });
      return false;
    } catch (error) {
      if (["LEASE_LOST", "STALE_NAVIGATION", "CONTROL_STALE"].includes(error?.code)) {
        return true;
      }
      throw error;
    }
  }

  async function closeTabLifecycle(windowId, tabId) {
    approvalManager.tabClosed?.(windowId, tabId);
    grants.tabClosed?.(windowId, tabId);
    sessionService?.clearTabSessionInjected?.(windowId, tabId);
    const invalidated = leases.tabClosed(windowId, tabId);
    await executor?.tabClosed?.(windowId, tabId);
    return invalidated;
  }

  function revokeControlLifecycle(windowId, tabId, currentControlEpoch) {
    approvalManager.controlChanged?.(windowId, tabId);
    grants.controlChanged?.(windowId, tabId);
    return leases.controlChanged(windowId, tabId, currentControlEpoch);
  }

  const inFlightByTab = new Map();

  function tabFlightKey(windowId, tabId) {
    return `${windowId}\u0000${tabId}`;
  }

  function trackInFlight(windowId, tabId, controller) {
    const key = tabFlightKey(windowId, tabId);
    let set = inFlightByTab.get(key);
    if (!set) {
      set = new Set();
      inFlightByTab.set(key, set);
    }
    set.add(controller);
    return () => {
      set.delete(controller);
      if (set.size === 0) inFlightByTab.delete(key);
    };
  }

  function abortInFlight(windowId, tabId) {
    const key = tabFlightKey(windowId, tabId);
    const set = inFlightByTab.get(key);
    if (!set) return;
    for (const controller of [...set]) {
      try {
        controller.abort();
      } catch {
        // AbortController.abort is best-effort for reclaim.
      }
    }
    inFlightByTab.delete(key);
  }

  function bindOwnedSignal(parentSignal) {
    const local = new AbortController();
    if (parentSignal?.aborted === true) {
      local.abort();
      return local;
    }
    parentSignal?.addEventListener?.("abort", () => {
      try {
        local.abort();
      } catch {
        // Parent cancellation already owns the failure path.
      }
    }, { once: true });
    return local;
  }

  function humanReclaim(windowId, tabId, { reason } = {}) {
    const tab = registry.getTab(windowId, tabId);
    if (!tab) return Object.freeze({ reclaimed: false });
    if (leases.isAvailable(windowId, tabId)) {
      return Object.freeze({ reclaimed: false });
    }
    if (typeof registry.rotateControlEpoch !== "function") {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-control-source" });
    }
    const controlEpoch = registry.rotateControlEpoch(windowId, tabId);
    if (!Number.isSafeInteger(controlEpoch) || controlEpoch < 0) {
      fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-control-source" });
    }
    abortInFlight(windowId, tabId);
    revokeControlLifecycle(windowId, tabId, controlEpoch);
    return Object.freeze({
      reclaimed: true,
      controlEpoch,
      ...(reason ? { reason } : {}),
    });
  }

  function quarantineUncertainClose(windowId, tabId) {
    registry.closeTab(windowId, tabId);
    void closeTabLifecycle(windowId, tabId).catch(() => undefined);
    try {
      void Promise.resolve(destroyTarget({ tabId, windowId })).catch(() => undefined);
    } catch {
      // Registry and authority are already synchronously quarantined.
    }
  }

  async function dispatch({ connectionId, params, signal }) {
    assertNotCancelled(signal);
    if (typeof connectionId !== "string" || connectionId.length === 0) {
      throw new TypeError("A main-owned Browser connectionId is required.");
    }
    const parsed = browserActionRequestSchema.safeParse(params?.request);
    if (!parsed.success) fail("CAPABILITY_NOT_VERIFIED", { capability: "browser-request" });
    const request = parsed.data;

    if (request.action === "get_state") {
      return Object.freeze({ targets: Object.freeze(listSafeTargets()) });
    }

    if (request.action === "open") {
      const partition = partitionSelector.select("AiSandbox");
      let created = null;
      let handedOff = false;
      try {
        assertNotCancelled(signal);
        // This adapter is a trusted main-process boundary. The selector still
        // verifies the exact webContents object; adapter claims alone never
        // authorize a lease.
        created = await createAiSandboxTarget({
          automationMode: "AiSandbox",
          partition,
          signal,
          url: request.url,
        });
        assertNotCancelled(signal);
        if (
          created?.automationMode !== "AiSandbox"
          || created?.partition !== partition.partition
          || !partition.isPagePolicyAttached?.(created?.webContents)
        ) {
          fail("CAPABILITY_NOT_VERIFIED", { capability: "ai-sandbox-partition" });
        }
        const tab = getTarget(created.windowId, created.tabId);
        assertKnownAutomationMode(tab);
        if (tab.automationMode !== "AiSandbox") {
          fail("CAPABILITY_NOT_VERIFIED", { capability: "ai-sandbox-partition" });
        }
        assertNotCancelled(signal);
        const result = acquire(connectionId, created.windowId, tab);
        assertNotCancelled(signal);
        handedOff = true;
        return result;
      } finally {
        if (created && !handedOff) {
          // Revoke all main-owned authority synchronously. Native teardown may
          // reject or never settle, so no registry target or lease can remain
          // acquirable while cleanup is in flight.
          registry.closeTab(created.windowId, created.tabId);
          leases.tabClosed(created.windowId, created.tabId);
          let destroyed = false;
          try {
            destroyed = await destroyTarget({
              tabId: created.tabId,
              windowId: created.windowId,
            }) === true;
          } catch {
            // Unconfirmed native teardown retains the policy proof and handlers.
          }
          if (destroyed) {
            try {
              partition.disposePagePolicy?.(created.webContents);
            } catch {
              // Native teardown is already confirmed; listener cleanup is best effort.
            }
          }
        }
      }
    }

    if (request.action === "acquire_control") {
      const resolved = resolveAcquireTarget(connectionId, params?.target);
      return acquire(connectionId, resolved.windowId, resolved.tab);
    }

    if (request.action === "release_control") {
      const control = params?.control;
      if (!control || typeof control !== "object") fail("LEASE_LOST");
      const tab = getTarget(control.windowId, control.tabId);
      const result = leases.release({
        ...params.control,
        connectionId,
        currentControlEpoch: readCurrentControlEpoch(control.windowId, tab),
        currentNavigationGeneration: tab.navigationGeneration,
      });
      approvalManager.controlChanged?.(control.windowId, control.tabId);
      grants.controlChanged?.(control.windowId, control.tabId);
      return result;
    }
    // Lease presence before capability/approval gates keeps missing-control
    // failures as LEASE_LOST and avoids creating approvals for unavailable powers.
    assertControl(connectionId, params?.control);
    if (request.action === "execute_js") {
      const control = params?.control;
      const tab = control
        ? registry.getTab(control.windowId, control.tabId)
        : null;
      const sessionInjected = Boolean(
        sessionService
        && typeof sessionService.isSessionInjected === "function"
        && control
        && sessionService.isSessionInjected(control.windowId, control.tabId),
      );
      if (sessionInjected) {
        fail("CAPABILITY_NOT_VERIFIED", {
          action: "execute_js",
          capability: "execute_js-session-injected",
        });
      }
      let partitionPersistent = false;
      if (tab?.automationMode) {
        try {
          partitionPersistent = partitionSelector.select(tab.automationMode)?.persistent === true;
        } catch {
          partitionPersistent = true;
        }
      }
      try {
        if (!capabilities || typeof capabilities.assertExecuteJsAllowed !== "function") {
          fail("CAPABILITY_NOT_VERIFIED", {
            action: "execute_js",
            capability: "execute_js-security",
          });
        }
        capabilities.assertExecuteJsAllowed({
          automationMode: tab?.automationMode,
          partitionPersistent,
          sessionInjected: false,
        });
      } catch (error) {
        if (error instanceof BrowserPublicError) throw error;
        fail("CAPABILITY_NOT_VERIFIED", {
          action: "execute_js",
          capability: "execute_js-security",
        });
      }
    }
    const isSessionAction = request.action === "session_save"
      || request.action === "session_load";
    if (isSessionAction) {
      if (
        !sessionService
        || typeof sessionService.save !== "function"
        || typeof sessionService.load !== "function"
        || !sessionCapabilities
        || typeof sessionCapabilities.assertSaveAllowed !== "function"
      ) {
        fail("CAPABILITY_NOT_VERIFIED", { action: request.action });
      }
      try {
        if (request.action === "session_save") {
          sessionCapabilities.assertSaveAllowed();
        } else {
          sessionCapabilities.assertLoadAllowed({});
        }
      } catch (error) {
        if (error instanceof BrowserPublicError) throw error;
        fail("CAPABILITY_NOT_VERIFIED", { action: request.action });
      }
    } else if (!executor || typeof executor.execute !== "function") {
      fail("CAPABILITY_NOT_VERIFIED", { action: request.action });
    }
    const decision = await guard.authorize({
      ...(params?.approvalId !== undefined ? { approvalId: params.approvalId } : {}),
      ...(params?.control ? { control: params.control } : {}),
      request,
    }, {
      connectionId,
      signal,
    });
    if (decision.kind === "denied") throw decision.error;
    if (decision.kind === "approval-required") {
      fail("APPROVAL_REQUIRED", {
        action: request.action,
        approvalId: decision.approval.approvalId,
        ...(decision.approval.descriptor?.destination
          ? { destination: decision.approval.descriptor.destination }
          : {}),
        operation: decision.operation,
        origin: decision.origin,
        tabId: decision.binding.tabId,
        ...(decision.approval.descriptor?.target
          ? { target: decision.approval.descriptor.target }
          : {}),
        windowId: decision.binding.windowId,
      });
    }
    const before = {
      lease: decision.lease,
      sourceControlEpoch: decision.sourceControlEpoch,
      tab: decision.tab,
    };
    const owned = bindOwnedSignal(signal);
    const untrack = trackInFlight(before.lease.windowId, before.lease.tabId, owned);
    let result;
    try {
      if (isSessionAction) {
        const tab = before.tab;
        const committedOrigin = typeof tab.url === "string" ? tab.url : "";
        const partitionSession = typeof sessionService.resolvePartitionSession === "function"
          ? sessionService.resolvePartitionSession({
            control: before.lease,
            tab,
          })
          : null;
        const runContext = {
          control: before.lease,
          signal: owned.signal,
          tab,
          windowId: before.lease.windowId,
          tabId: before.lease.tabId,
        };
        const revalidate = () => {
          assertNotCancelled(owned.signal);
          if (isControlInvalidated(connectionId, params.control)) return false;
          const current = registry.getTab(before.lease.windowId, before.lease.tabId);
          if (!current) return false;
          if (readCurrentControlEpoch(before.lease.windowId, current) !== before.sourceControlEpoch) {
            return false;
          }
          if (current.navigationGeneration !== before.lease.navigationGeneration) {
            return false;
          }
          return true;
        };
        if (request.action === "session_save") {
          result = await sessionService.save({
            committedOrigin,
            name: request.name,
            partitionSession,
            revalidate,
            runContext,
          });
        } else {
          result = await sessionService.load({
            committedOrigin,
            name: request.name,
            partitionSession,
            revalidate,
            runContext,
            tabId: before.lease.tabId,
            windowId: before.lease.windowId,
          });
        }
      } else {
        result = await executor.execute({
          actionTimeoutMs: params?.actionTimeoutMs,
          approvedPayloadHash: decision.approvedPayloadHash,
          control: before.lease,
          request,
          signal: owned.signal,
          tab: before.tab,
        });
      }
    } catch (error) {
      const cancelledByOwner = owned.signal.aborted === true;
      const publicCode = error instanceof BrowserPublicError ? error.code : null;
      if (
        cancelledByOwner
        || publicCode === "TIMEOUT"
        || publicCode === "CANCELLED"
      ) {
        if (request.action === "close") {
          quarantineUncertainClose(before.lease.windowId, before.lease.tabId);
        } else if (request.action === "focus") {
          revokeControlLifecycle(
            before.lease.windowId,
            before.lease.tabId,
            before.sourceControlEpoch,
          );
        }
      }
      if (cancelledByOwner) {
        if (publicCode === "CANCELLED") throw error;
        fail("CANCELLED");
      }
      throw error;
    } finally {
      untrack();
    }
    if (request.action === "close") {
      if (result?.closed !== true) fail("OPERATION_NOT_ALLOWED");
      if (registry.getTab(before.lease.windowId, before.lease.tabId)) {
        await closeTabLifecycle(before.lease.windowId, before.lease.tabId);
        fail("CONTROL_STALE", {
          tabId: before.lease.tabId,
          windowId: before.lease.windowId,
        });
      }
      // Native close can remove the registry tab before its lifecycle event is
      // delivered. Seal every authority owner idempotently before success.
      await closeTabLifecycle(before.lease.windowId, before.lease.tabId);
      if (!isControlInvalidated(connectionId, params.control)) {
        fail("CONTROL_STALE", {
          tabId: before.lease.tabId,
          windowId: before.lease.windowId,
        });
      }
      return Object.freeze({ ...result, controlInvalidated: true });
    }
    if (request.action === "navigate") {
      const afterTab = getTarget(before.lease.windowId, before.lease.tabId);
      if (result?.navigated !== true) {
        // Compatibility seam for non-navigation executor doubles. A real
        // executor marks committed navigation with `navigated: true`.
        assertControl(connectionId, params.control);
        return result;
      }
      if (
        afterTab.navigationGeneration <= before.lease.navigationGeneration
        || readCurrentControlEpoch(before.lease.windowId, afterTab) <= before.sourceControlEpoch
        || !isControlInvalidated(connectionId, params.control)
      ) {
        fail("CONTROL_STALE", {
          tabId: before.lease.tabId,
          windowId: before.lease.windowId,
        });
      }
      // A committed agent navigation intentionally invalidates the old lease.
      // Return only the new public generation; the owner must acquire a fresh
      // token before observing or acting on the new document.
      return Object.freeze({
        ...result,
        controlInvalidated: true,
        navigationGeneration: afterTab.navigationGeneration,
      });
    }
    assertControl(connectionId, params.control);
    return result;
  }

  return Object.freeze({
    // Task 7 wires trusted UI/policy authority events into this lifecycle.
    // It rotates control without pretending that the document navigated.
    controlChanged: (windowId, tabId, currentControlEpoch) => {
      const tab = registry.getTab(windowId, tabId);
      const explicitControlEpoch = explicitLifecycleControlEpoch(currentControlEpoch);
      const sourceControlEpoch = explicitControlEpoch !== undefined
        ? explicitControlEpoch
        : (tab ? readCurrentControlEpoch(windowId, tab) : undefined);
      abortInFlight(windowId, tabId);
      return revokeControlLifecycle(windowId, tabId, sourceControlEpoch);
    },
    dispatch,
    humanReclaim,
    navigationChanged: (windowId, tabId, navigationGeneration, currentControlEpoch) => {
      if (!Number.isSafeInteger(navigationGeneration) || navigationGeneration < 0) {
        throw new TypeError("A nonnegative Browser navigation generation is required.");
      }
      const tab = registry.getTab(windowId, tabId);
      const explicitControlEpoch = explicitLifecycleControlEpoch(currentControlEpoch);
      const sourceControlEpoch = explicitControlEpoch !== undefined
        ? explicitControlEpoch
        : (tab ? readCurrentControlEpoch(windowId, tab) : undefined);
      approvalManager.navigationChanged?.(windowId, tabId);
      grants.navigationChanged?.(windowId, tabId);
      executor?.navigationChanged?.(windowId, tabId, navigationGeneration);
      return leases.navigationChanged(
        windowId,
        tabId,
        navigationGeneration,
        sourceControlEpoch,
      );
    },
    cancelPendingApprovals: (connectionId) => approvalManager.cancelConnection?.(connectionId),
    releaseOwnership: (connectionId) => {
      approvalManager.cancelConnection?.(connectionId);
      return leases.releaseConnection(connectionId);
    },
    resolveApproval: (input) => approvalManager.resolve?.(input),
    revokeGrant: (grantId) => grants.revoke(grantId),
    snapshotApprovals: (input) => approvalManager.snapshot?.(input),
    snapshotGrants: () => grants.snapshot(),
    subscribeApprovals: (listener) => approvalManager.subscribe?.(listener),
    subscribeGrants: (listener) => grants.subscribe(listener),
    tabClosed: closeTabLifecycle,
    windowClosed: (windowId) => {
      approvalManager.windowClosed?.(windowId);
      grants.windowClosed?.(windowId);
      executor?.windowClosed?.(windowId);
      return leases.windowClosed(windowId);
    },
  });
}

module.exports = {
  createBrowserCommandDispatcher,
  redactUrl,
};
