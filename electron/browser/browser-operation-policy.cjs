"use strict";

const {
  BROWSER_AUTHORITY_OPERATIONS,
} = require("../shared/browser-contract.cjs");

const BROWSER_OPERATION_POLICY_TABLE = Object.freeze({
  read: Object.freeze({
    approvalClass: "none",
    humanOnly: false,
    operation: "read",
    requiresAttachment: false,
    requiresExactPayload: false,
    standingGrantable: true,
    timeoutClass: "read",
  }),
  attach: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: false,
    operation: "attach",
    requiresAttachment: false,
    requiresExactPayload: false,
    standingGrantable: false,
    timeoutClass: "mutate",
  }),
  click: Object.freeze({
    approvalClass: "exact-or-standing",
    humanOnly: false,
    operation: "click",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: true,
    timeoutClass: "mutate",
  }),
  type: Object.freeze({
    approvalClass: "exact-or-standing",
    humanOnly: false,
    operation: "type",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: true,
    timeoutClass: "mutate",
  }),
  scroll: Object.freeze({
    approvalClass: "exact-or-standing",
    humanOnly: false,
    operation: "scroll",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: true,
    timeoutClass: "mutate",
  }),
  key: Object.freeze({
    approvalClass: "exact-or-standing",
    humanOnly: false,
    operation: "key",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: true,
    timeoutClass: "mutate",
  }),
  style: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: false,
    operation: "style",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: false,
    timeoutClass: "mutate",
  }),
  navigate: Object.freeze({
    approvalClass: "exact-or-standing",
    humanOnly: false,
    operation: "navigate",
    requiresAttachment: false,
    requiresExactPayload: true,
    standingGrantable: true,
    timeoutClass: "navigate",
  }),
  publish: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: false,
    operation: "publish",
    requiresAttachment: false,
    requiresExactPayload: true,
    standingGrantable: false,
    timeoutClass: "read",
  }),
  upload: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: true,
    operation: "upload",
    requiresAttachment: true,
    requiresExactPayload: true,
    standingGrantable: false,
    timeoutClass: "mutate",
  }),
  eval: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: false,
    operation: "eval",
    requiresAttachment: false,
    requiresExactPayload: true,
    standingGrantable: false,
    timeoutClass: "eval",
  }),
  session: Object.freeze({
    approvalClass: "exact-once",
    humanOnly: false,
    operation: "session",
    requiresAttachment: false,
    requiresExactPayload: true,
    standingGrantable: false,
    timeoutClass: "session",
  }),
});

function assertCompletePolicyTable() {
  for (const operation of BROWSER_AUTHORITY_OPERATIONS) {
    if (!BROWSER_OPERATION_POLICY_TABLE[operation]) {
      throw new TypeError(`Missing browser operation policy for ${operation}.`);
    }
  }
}

assertCompletePolicyTable();

function getBrowserOperationPolicy(operation) {
  const policy = BROWSER_OPERATION_POLICY_TABLE[operation];
  if (!policy) {
    throw new TypeError(`Unknown browser authority operation: ${operation}`);
  }
  return policy;
}

function listBrowserOperationPolicies() {
  return BROWSER_AUTHORITY_OPERATIONS.map((operation) => getBrowserOperationPolicy(operation));
}

module.exports = {
  BROWSER_OPERATION_POLICY_TABLE,
  getBrowserOperationPolicy,
  listBrowserOperationPolicies,
};
