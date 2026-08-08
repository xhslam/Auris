"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { EventEmitter } = require("node:events");
const { existsSync } = require("node:fs");
const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../../electron/shared/browser-resource-budgets.cjs");
const {
  DEFAULT_MAX_APPROVALS_PER_CONNECTION,
  DEFAULT_MAX_PENDING_APPROVALS,
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("../../electron/browser/browser-approvals.cjs");
const {
  createBrowserHibernation,
} = require("../../electron/browser/browser-hibernation.cjs");
const {
  MAX_CONSOLE_ENTRIES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_TOTAL_BYTES,
  MAX_RESULT_BYTES,
  createBrowserPageExecutor,
} = require("../../electron/browser/browser-page-executor.cjs");
const {
  MAX_PENDING_BROWSER_REQUESTS,
} = require("../../electron/browser/browser-mcp-router.cjs");
const {
  createWorkflowRunRegistry,
} = require("../../electron/workflows/workflow-run-registry.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeWebContents extends EventEmitter {
  capturePage = async () => ({
    toPNG: () => Buffer.from("bounded-png-evidence"),
  });
  getURL = () => "https://example.com/research";
  isDestroyed = () => false;
}

async function run() {
  assert(
    BROWSER_RESOURCE_BUDGETS.maxLiveViews === 8,
    "live-view budget changed",
  );
  assert(
    MAX_RESULT_BYTES === BROWSER_RESOURCE_BUDGETS.maxResultBytes,
    "result budget drifted",
  );
  assert(
    MAX_CONSOLE_ENTRIES === BROWSER_RESOURCE_BUDGETS.maxConsoleEntries,
    "console budget drifted",
  );
  assert(
    MAX_EVIDENCE_FILES === BROWSER_RESOURCE_BUDGETS.maxEvidenceFiles,
    "evidence file budget drifted",
  );
  assert(
    MAX_EVIDENCE_TOTAL_BYTES === BROWSER_RESOURCE_BUDGETS.maxEvidenceTotalBytes,
    "evidence byte budget drifted",
  );
  assert(
    DEFAULT_MAX_PENDING_APPROVALS ===
      BROWSER_RESOURCE_BUDGETS.maxPendingApprovals,
    "approval budget drifted",
  );
  assert(
    DEFAULT_MAX_APPROVALS_PER_CONNECTION ===
      BROWSER_RESOURCE_BUDGETS.maxApprovalsPerConnection,
    "owner approval budget drifted",
  );
  assert(
    MAX_PENDING_BROWSER_REQUESTS ===
      BROWSER_RESOURCE_BUDGETS.maxPendingBrowserRequests,
    "request budget drifted",
  );

  let approvalRandom = 0;
  const approvals = createBrowserApprovalManager({
    randomBytes: () => Buffer.alloc(24, ++approvalRandom),
  });
  for (
    let index = 0;
    index < BROWSER_RESOURCE_BUDGETS.maxPendingApprovals;
    index += 1
  ) {
    const connectionId = `approval-owner-${index}`;
    approvals.request({
      action: "read",
      connectionId,
      controlEpoch: 1,
      navigationGeneration: 1,
      operation: "read",
      origin: "https://example.com",
      owner: { id: connectionId, kind: "mcp" },
      payloadHash: hashBrowserApprovalPayload({ action: "read", index }),
      tabId: `tab-${index}`,
      windowId: "window-budget",
    });
  }
  try {
    const connectionId = "approval-overflow";
    approvals.request({
      action: "read",
      connectionId,
      controlEpoch: 1,
      navigationGeneration: 1,
      operation: "read",
      origin: "https://example.com",
      owner: { id: connectionId, kind: "mcp" },
      payloadHash: hashBrowserApprovalPayload({
        action: "read",
        overflow: true,
      }),
      tabId: "tab-overflow",
      windowId: "window-budget",
    });
    throw new Error("approval budget was not enforced");
  } catch (error) {
    assert(
      error?.code === "CAPABILITY_NOT_VERIFIED",
      "unexpected approval limit failure",
    );
  }

  const hibernation = createBrowserHibernation();
  const tabs = Array.from({ length: 9 }, (_, index) => ({
    active: false,
    controlled: false,
    lastActiveAt: index,
    lifecycle: "ready",
    loading: false,
    pendingApproval: false,
    tabId: `tab-${index}`,
    windowId: "window-budget",
  }));
  const victims = hibernation.pickVictims({ tabs });
  assert(
    victims.length === 1 && victims[0].tabId === "tab-0",
    "hibernation threshold failed",
  );

  let random = 0;
  const workflows = createWorkflowRunRegistry({
    randomBytes: () => Buffer.alloc(12, ++random),
  });
  for (
    let index = 0;
    index < BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner;
    index += 1
  ) {
    workflows.create({ family: "nia_yaml", ownerId: "budget-owner" });
  }
  try {
    workflows.create({ family: "nia_yaml", ownerId: "budget-owner" });
    throw new Error("workflow owner budget was not enforced");
  } catch (error) {
    assert(error?.code === "RUN_LIMIT", "unexpected workflow limit failure");
  }
  assert(
    workflows.cancelOwner("budget-owner") ===
      BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner,
    "workflow cancellation leaked runs",
  );
  for (const ownerId of ["global-one", "global-two"]) {
    for (
      let index = 0;
      index < BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner;
      index += 1
    ) {
      workflows.create({ family: "nia_yaml", ownerId });
    }
  }
  try {
    workflows.create({ family: "nia_yaml", ownerId: "global-overflow" });
    throw new Error("global workflow budget was not enforced");
  } catch (error) {
    assert(
      error?.code === "RUN_LIMIT",
      "unexpected global workflow limit failure",
    );
  }
  workflows.cancelOwner("global-one");
  workflows.cancelOwner("global-two");

  const webContents = new FakeWebContents();
  const executor = createBrowserPageExecutor({
    getWebContents: () => webContents,
  });
  const control = {
    controlEpoch: 1,
    leaseToken: "budget-lease-token",
    navigationGeneration: 1,
    tabId: "tab-budget",
    windowId: "window-budget",
  };
  const evidence = await executor.execute({
    actionTimeoutMs: 1_000,
    control,
    request: { action: "screenshot", publication: "evidence" },
    signal: new AbortController().signal,
    tab: { navigationGeneration: 1, tabId: "tab-budget" },
  });
  const evidencePath = executor.resolveEvidencePath(evidence.evidenceRef);
  assert(
    evidencePath && existsSync(evidencePath),
    "temporary evidence was not written",
  );
  await executor.cleanup();
  assert(!existsSync(evidencePath), "temporary evidence survived cleanup");

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      budgets: BROWSER_RESOURCE_BUDGETS,
      evidenceCleanup: true,
      hibernated: victims.length,
      workflowOwnerLimit: BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner,
    })}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
