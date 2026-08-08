"use strict";

/**
 * Bounded HTTPS REST transport for Nia providers.
 *
 * Plain HTTP is allowed only for an explicitly configured Ollama-compatible
 * provider whose resolved destination remains loopback on every redirect.
 */

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const {
  buildChatRequest,
  buildPromptRequest,
  parseNonStreamResponse,
  parseStreamEvent,
  redactSecrets,
  safeHttpErrorMessage,
} = require("./nia-rest-protocols.cjs");

const NIA_REST_PROVIDER_ERROR_CODES = Object.freeze([
  "NON_HTTPS_ENDPOINT_REJECTED",
  "NON_LOOPBACK_HTTP_REJECTED",
  "REDIRECT_DESTINATION_REJECTED",
  "TIMEOUT",
  "CANCELLED",
  "RESPONSE_TOO_LARGE",
  "PROVIDER_HTTP_ERROR",
  "TRANSPORT_ERROR",
  "MALFORMED_RESPONSE",
  "INVALID_REQUEST",
]);

const ALLOWED_REQUEST_HEADER_NAMES = Object.freeze([
  "accept",
  "anthropic-version",
  "authorization",
  "content-type",
  "x-api-key",
  "x-goog-api-key",
]);

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RETRIES = 1;

class NiaRestProviderError extends Error {
  constructor(code, message, details) {
    if (!NIA_REST_PROVIDER_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia REST provider error code: ${code}`);
    }
    super(message);
    this.name = "NiaRestProviderError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function restError(code, message, details) {
  return new NiaRestProviderError(code, message, details);
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function assertAllowedDestination(url, { protocol, allowOllamaHttp }) {
  if (url.protocol === "https:") return;
  if (
    url.protocol === "http:" &&
    allowOllamaHttp &&
    protocol === "ollama" &&
    isLoopbackHost(url.hostname)
  ) {
    return;
  }
  if (url.protocol === "http:") {
    throw restError(
      "NON_LOOPBACK_HTTP_REJECTED",
      "HTTP is only allowed for Ollama loopback destinations.",
    );
  }
  throw restError("NON_HTTPS_ENDPOINT_REJECTED", "Remote REST endpoints must use HTTPS.");
}

function filterHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (!ALLOWED_REQUEST_HEADER_NAMES.includes(lower)) continue;
    if (typeof value !== "string") continue;
    out[lower] = value;
  }
  return out;
}

function createNiaRestProvider({
  fetchImpl = null,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  maxRetries = DEFAULT_MAX_RETRIES,
} = {}) {
  async function nodeFetch(urlString, { method, headers, body, signal, redirect } = {}) {
    if (typeof fetchImpl === "function") {
      return fetchImpl(urlString, { method, headers, body, signal, redirect });
    }

    const url = new URL(urlString);
    const transport = url.protocol === "http:" ? http : https;
    const payload = body == null ? null : Buffer.from(body, "utf8");

    return new Promise((resolve, reject) => {
      const request = transport.request(
        url,
        {
          method: method || "GET",
          headers: {
            ...headers,
            ...(payload ? { "content-length": String(payload.length) } : {}),
          },
        },
        (response) => {
          const chunks = [];
          let total = 0;
          let aborted = false;
          response.on("data", (chunk) => {
            if (aborted) return;
            total += chunk.length;
            chunks.push(chunk);
          });
          response.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              ok: response.statusCode >= 200 && response.statusCode < 300,
              status: response.statusCode,
              headers: {
                get(name) {
                  const value = response.headers[String(name).toLowerCase()];
                  return Array.isArray(value) ? value[0] : value ?? null;
                },
              },
              async text() {
                return buffer.toString("utf8");
              },
              async arrayBuffer() {
                return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
              },
              body: null,
              url: urlString,
            });
          });
          response.on("error", reject);
          if (signal) {
            const onAbort = () => {
              aborted = true;
              request.destroy();
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort, { once: true });
          }
        },
      );
      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  async function performOnce({
    method,
    url,
    headers,
    body,
    signal,
    timeoutMs,
    maxOutputBytes,
    protocol,
    allowOllamaHttp,
  }) {
    let currentUrl = url;
    let redirects = 0;

    while (true) {
      const parsed = new URL(currentUrl);
      assertAllowedDestination(parsed, { protocol, allowOllamaHttp });

      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) throw restError("CANCELLED", "REST request cancelled.");
        signal.addEventListener("abort", onExternalAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await nodeFetch(currentUrl, {
          method,
          headers: filterHeaders(headers),
          body: body == null ? undefined : JSON.stringify(body),
          signal: controller.signal,
          redirect: "manual",
        });

        const status = response.status;
        if (status >= 300 && status < 400) {
          const location = response.headers.get("location");
          if (!location || redirects >= maxRedirects) {
            throw restError("REDIRECT_DESTINATION_REJECTED", "Redirect rejected or exhausted.");
          }
          const nextUrl = new URL(location, currentUrl);
          try {
            assertAllowedDestination(nextUrl, { protocol, allowOllamaHttp });
          } catch {
            throw restError(
              "REDIRECT_DESTINATION_REJECTED",
              "Redirect destination is not allowed.",
            );
          }
          currentUrl = nextUrl.toString();
          redirects += 1;
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) {
          const text = await response.text();
          if (Buffer.byteLength(text, "utf8") > maxOutputBytes) {
            throw restError("RESPONSE_TOO_LARGE", "Error body exceeded output cap.");
          }
          throw restError(
            "PROVIDER_HTTP_ERROR",
            safeHttpErrorMessage(status, text),
            { status },
          );
        }

        return { response, contentType, finalUrl: currentUrl };
      } catch (error) {
        if (error instanceof NiaRestProviderError) throw error;
        if (error?.name === "AbortError") {
          if (signal?.aborted) throw restError("CANCELLED", "REST request cancelled.");
          throw restError("TIMEOUT", `REST request timed out after ${timeoutMs}ms.`);
        }
        throw restError(
          "TRANSPORT_ERROR",
          redactSecrets(error instanceof Error ? error.message : String(error)),
        );
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  async function readCappedText(response, maxOutputBytes) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxOutputBytes) {
      throw restError("RESPONSE_TOO_LARGE", "Response body exceeded output cap.");
    }
    return text;
  }

  async function executePrompt({
    provider,
    apiKey = null,
    model,
    prompt,
    stream = false,
    signal = null,
    onDelta = null,
  }) {
    if (!provider || provider.kind !== "rest") {
      throw restError("INVALID_REQUEST", "A REST provider config is required.");
    }

    const request = buildPromptRequest({
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      apiKey,
      model,
      prompt,
      maxTokens: provider.capabilities?.maxOutputTokens,
      stream: stream === true && provider.capabilities?.streaming === true,
    });

    const timeoutMs = provider.bounds?.timeoutMs ?? 60_000;
    const maxOutputBytes = provider.bounds?.maxOutputBytes ?? 1_048_576;
    const allowOllamaHttp = provider.protocol === "ollama";

    let attempt = 0;
    let lastError = null;
    while (attempt <= maxRetries) {
      try {
        const { response, contentType } = await performOnce({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
          signal,
          timeoutMs,
          maxOutputBytes,
          protocol: provider.protocol,
          allowOllamaHttp,
        });

        const wantsStream =
          request.body?.stream === true && /event-stream|ndjson|json/iu.test(contentType || "application/json");

        if (wantsStream && typeof onDelta === "function" && contentType.includes("event-stream")) {
          const text = await readCappedText(response, maxOutputBytes);
          let assembled = "";
          for (const line of text.split(/\r?\n/u)) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            const event = parseStreamEvent(provider.protocol, payload);
            if (event.kind === "delta" && event.text) {
              assembled += event.text;
              if (Buffer.byteLength(assembled, "utf8") > maxOutputBytes) {
                throw restError("RESPONSE_TOO_LARGE", "Streamed output exceeded cap.");
              }
              onDelta(event.text);
            }
          }
          return Object.freeze({
            text: assembled,
            toolCalls: Object.freeze([]),
            logSafe: request.logSafe,
          });
        }

        const raw = await readCappedText(response, maxOutputBytes);
        let json;
        try {
          json = JSON.parse(raw);
        } catch {
          throw restError("MALFORMED_RESPONSE", "Provider returned non-JSON body.");
        }
        const parsed = parseNonStreamResponse(provider.protocol, json);
        if (typeof onDelta === "function" && parsed.text) onDelta(parsed.text);
        return Object.freeze({
          text: parsed.text,
          finishReason: parsed.finishReason,
          toolCalls: parsed.toolCalls || Object.freeze([]),
          logSafe: request.logSafe,
        });
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof NiaRestProviderError &&
          (error.code === "TIMEOUT" || error.code === "TRANSPORT_ERROR") &&
          attempt < maxRetries;
        if (!retryable) throw error;
        attempt += 1;
      }
    }
    throw lastError;
  }

  async function executeChatTurn({
    provider,
    apiKey = null,
    model,
    messages,
    tools = null,
    signal = null,
    onDelta = null,
  }) {
    if (!provider || provider.kind !== "rest") {
      throw restError("INVALID_REQUEST", "A REST provider config is required.");
    }

    const request = buildChatRequest({
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      apiKey,
      model,
      messages,
      tools,
      maxTokens: provider.capabilities?.maxOutputTokens,
      // Tool rounds stay non-stream so tool_calls parse reliably.
      stream: false,
    });

    const timeoutMs = provider.bounds?.timeoutMs ?? 60_000;
    const maxOutputBytes = provider.bounds?.maxOutputBytes ?? 1_048_576;
    const allowOllamaHttp = provider.protocol === "ollama";

    const { response } = await performOnce({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      signal,
      timeoutMs,
      maxOutputBytes,
      protocol: provider.protocol,
      allowOllamaHttp,
    });

    const raw = await readCappedText(response, maxOutputBytes);
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw restError("MALFORMED_RESPONSE", "Provider returned non-JSON body.");
    }
    const parsed = parseNonStreamResponse(provider.protocol, json);
    if (typeof onDelta === "function" && parsed.text) onDelta(parsed.text);
    return Object.freeze({
      text: parsed.text || "",
      finishReason: parsed.finishReason,
      toolCalls: parsed.toolCalls || Object.freeze([]),
      logSafe: request.logSafe,
    });
  }

  return Object.freeze({
    executePrompt,
    executeChatTurn,
    assertAllowedDestination: (url, options) =>
      assertAllowedDestination(new URL(url), options),
  });
}

module.exports = {
  ALLOWED_REQUEST_HEADER_NAMES,
  NIA_REST_PROVIDER_ERROR_CODES,
  NiaRestProviderError,
  createNiaRestProvider,
  isLoopbackHost,
};
