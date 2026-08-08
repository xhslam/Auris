"use strict";

/**
 * Release-enforced browser/workflow resource ceilings. Keep these in one
 * dependency-free module so packaged smoke tests exercise the same values as
 * main-process services.
 */
const BROWSER_RESOURCE_BUDGETS = Object.freeze({
  maxApprovalsPerConnection: 8,
  maxConsoleEntries: 200,
  maxEvidenceFiles: 32,
  maxEvidenceTotalBytes: 128 * 1_024 * 1_024,
  maxLiveViews: 8,
  maxPendingApprovals: 32,
  maxPendingBrowserRequests: 8,
  maxResultBytes: 256 * 1_024,
  maxSimultaneousWorkflowRuns: 16,
  maxWorkflowRunsPerOwner: 8,
});

module.exports = { BROWSER_RESOURCE_BUDGETS };
