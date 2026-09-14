"use strict";

const crypto = require("node:crypto");
const { createBrowserNavigationPolicy } = require("../browser/browser-navigation-policy.cjs");

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function workflowApiError(code, message, details) {
  const error = new Error(message); error.name = "WorkflowApiError"; error.code = code;
  if (details) error.details = details;
  return error;
}

function createBrowserWorkflowApiService({
  authorize,
  fetchImpl = globalThis.fetch,
  navigationPolicy = createBrowserNavigationPolicy(),
  maxRequestBytes = 256 * 1024,
  maxResponseBytes = 1024 * 1024,
  maxRedirects = 3,
  timeoutMs = 30_000,
} = {}) {
  if (typeof authorize !== "function") throw new TypeError("Workflow API authority is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("Workflow API fetch is required.");

  async function execute({ connectionId, control, method, url, body = null, headers = {}, approvalId, signal }) {
    const normalizedMethod = String(method || "").toUpperCase();
    if (!METHODS.has(normalizedMethod)) throw workflowApiError("METHOD_NOT_ALLOWED", "Unsupported API method.");
    let destination;
    try { destination = new URL(url); } catch { throw workflowApiError("DESTINATION_NOT_ALLOWED", "Invalid API URL."); }
    if (destination.protocol !== "https:" || destination.username || destination.password) {
      throw workflowApiError("DESTINATION_NOT_ALLOWED", "Workflow API requests require credential-free HTTPS.");
    }
    const requestBody = body == null ? null : Buffer.from(String(body), "utf8");
    if (requestBody && requestBody.length > maxRequestBytes) {
      throw workflowApiError("REQUEST_TOO_LARGE", "Workflow API request is too large.");
    }
    const operation = normalizedMethod === "GET" || normalizedMethod === "HEAD" ? "read" : "publish";

    const owned = new AbortController();
    const onAbort = () => owned.abort(signal?.reason);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = setTimeout(() => owned.abort("timeout"), timeoutMs);
    let current = destination;
    let currentMethod = normalizedMethod;
    try {
      for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
        const policy = await navigationPolicy.resolveDestination(current.href);
        if (!policy.allowed) throw workflowApiError("DESTINATION_NOT_ALLOWED", "API destination failed network policy.");
        const payloadHash = `sha256:${crypto.createHash("sha256")
          .update(currentMethod)
          .update("\0")
          .update(current.href)
          .update("\0")
          .update(requestBody ?? Buffer.alloc(0))
          .digest("hex")}`;
        const currentOperation = currentMethod === "GET" || currentMethod === "HEAD" ? "read" : "publish";
        const decision = await authorize({
          approvalId,
          bodyHash: payloadHash,
          connectionId,
          control,
          destination: current.href,
          method: currentMethod,
          operation: currentOperation,
          signal,
        });
        if (!decision || decision.allowed !== true) {
          throw workflowApiError(decision?.code || "APPROVAL_REQUIRED", "Workflow API request was not authorized.", decision);
        }
        let response;
        try {
          response = await fetchImpl(current.href, {
            method: currentMethod,
            headers: { ...headers },
            ...(requestBody && currentMethod !== "GET" && currentMethod !== "HEAD" ? { body: requestBody } : {}),
            redirect: "manual",
            signal: owned.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
        } catch (cause) {
          if (operation === "publish" && owned.signal.aborted) {
            throw workflowApiError("UNKNOWN_OUTCOME", "Write-like API outcome is unknown; reconcile before retry.");
          }
          throw cause;
        }
        if (REDIRECTS.has(response.status)) {
          if (redirect === maxRedirects) throw workflowApiError("TOO_MANY_REDIRECTS", "API redirect limit exceeded.");
          const location = response.headers.get("location");
          if (!location) throw workflowApiError("DESTINATION_NOT_ALLOWED", "Redirect omitted a destination.");
          current = new URL(location, current);
          if (current.protocol !== "https:") throw workflowApiError("DESTINATION_NOT_ALLOWED", "API redirect left HTTPS.");
          if (response.status === 303) currentMethod = "GET";
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxResponseBytes) throw workflowApiError("RESPONSE_TOO_LARGE", "Workflow API response is too large.");
        return Object.freeze({
          status: response.status,
          ok: response.ok,
          method: currentMethod,
          url: current.href,
          text: buffer.toString("utf8"),
        });
      }
      throw workflowApiError("TOO_MANY_REDIRECTS", "API redirect limit exceeded.");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
  }

  return Object.freeze({ execute });
}

module.exports = { createBrowserWorkflowApiService, workflowApiError };
