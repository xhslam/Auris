"use strict";

/**
 * Protocol request/response translation for Nia REST providers.
 *
 * Protocols: anthropic, openai, openai-compatible, google-ai, ollama.
 * OpenAI uses Chat Completions (pinned VMark behavior). Secrets never appear
 * in returned log-safe diagnostics.
 */

const NIA_REST_PROTOCOL_IDS = Object.freeze([
  "anthropic",
  "openai",
  "openai-compatible",
  "google-ai",
  "ollama",
]);

const NIA_REST_PROTOCOL_ERROR_CODES = Object.freeze([
  "UNKNOWN_PROTOCOL",
  "INVALID_REQUEST",
  "MALFORMED_RESPONSE",
  "PROVIDER_HTTP_ERROR",
  "MISSING_API_KEY",
  "MISSING_ENDPOINT",
]);

const DEFAULT_ENDPOINTS = Object.freeze({
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  "google-ai": "https://generativelanguage.googleapis.com",
  ollama: "http://127.0.0.1:11434",
});

const ANTHROPIC_CURATED_MODELS = Object.freeze([
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
]);

const SECRET_REDACT_PATTERN =
  /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]+|x-api-key["']?\s*[:=]\s*["']?[^"',\s]+|x-goog-api-key["']?\s*[:=]\s*["']?[^"',\s]+)/giu;

class NiaRestProtocolError extends Error {
  constructor(code, message, details) {
    if (!NIA_REST_PROTOCOL_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia REST protocol error code: ${code}`);
    }
    super(message);
    this.name = "NiaRestProtocolError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function protocolError(code, message, details) {
  return new NiaRestProtocolError(code, message, details);
}

function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.replace(SECRET_REDACT_PATTERN, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry));
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/api[_-]?key|authorization|token|secret|password/iu.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSecrets(entry);
      }
    }
    return out;
  }
  return value;
}

function normalizeRestBase(base) {
  if (typeof base !== "string") return "";
  const trimmed = base.trim().replace(/\/+$/u, "");
  if (trimmed.endsWith("/v1")) return trimmed.slice(0, -3);
  return trimmed;
}

function resolveEndpoint(protocol, endpoint) {
  if (protocol === "openai-compatible") {
    const base = normalizeRestBase(typeof endpoint === "string" ? endpoint : "");
    if (!base) {
      throw protocolError("MISSING_ENDPOINT", "Endpoint is required for openai-compatible.");
    }
    return base;
  }
  if (protocol === "google-ai") {
    return DEFAULT_ENDPOINTS["google-ai"];
  }
  const fallback = DEFAULT_ENDPOINTS[protocol];
  const raw = typeof endpoint === "string" && endpoint.length > 0 ? endpoint : fallback;
  return normalizeRestBase(raw);
}

function assertProtocol(protocol) {
  if (!NIA_REST_PROTOCOL_IDS.includes(protocol)) {
    throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${String(protocol)}`);
  }
}

function toAnthropicTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: "object", properties: {} },
  }));
}

function toOpenAiTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  }));
}

function toAnthropicMessages(messages) {
  const out = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const content = [];
      if (typeof message.content === "string" && message.content.length > 0) {
        content.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls || []) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: typeof call.arguments === "string"
            ? (() => {
              try { return JSON.parse(call.arguments); } catch { return {}; }
            })()
            : (call.arguments || {}),
        });
      }
      out.push({ role: "assistant", content: content.length > 0 ? content : "" });
      continue;
    }
    if (message.role === "tool") {
      out.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        }],
      });
    }
  }
  return out;
}

function toOpenAiMessages(messages) {
  const out = [];
  for (const message of messages) {
    if (message.role === "system") {
      out.push({ role: "system", content: message.content });
      continue;
    }
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const entry = { role: "assistant", content: message.content || null };
      if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
        entry.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: typeof call.arguments === "string"
              ? call.arguments
              : JSON.stringify(call.arguments || {}),
          },
        }));
      }
      out.push(entry);
      continue;
    }
    if (message.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }
  return out;
}

function extractSystemPrompt(messages) {
  const parts = [];
  for (const message of messages || []) {
    if (message.role === "system" && typeof message.content === "string") {
      parts.push(message.content);
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function buildChatRequest({
  protocol,
  endpoint,
  apiKey,
  model,
  messages,
  tools = null,
  maxTokens,
  stream = false,
}) {
  assertProtocol(protocol);
  if (!Array.isArray(messages) || messages.length === 0) {
    throw protocolError("INVALID_REQUEST", "Chat messages are required.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw protocolError("INVALID_REQUEST", "Model must be a non-empty string.");
  }
  if (protocol === "google-ai" || protocol === "ollama") {
    throw protocolError(
      "INVALID_REQUEST",
      `Host tool loops are not supported for protocol "${protocol}".`,
    );
  }

  const base = resolveEndpoint(protocol, endpoint);
  const tokens = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : undefined;

  switch (protocol) {
    case "anthropic": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "Anthropic API key is required.");
      const body = {
        model,
        max_tokens: tokens ?? 4096,
        messages: toAnthropicMessages(messages),
        stream: stream === true,
      };
      const system = extractSystemPrompt(messages);
      if (system) body.system = system;
      const anthropicTools = toAnthropicTools(tools);
      if (anthropicTools) body.tools = anthropicTools;
      return Object.freeze({
        method: "POST",
        url: `${base}/v1/messages`,
        headers: Object.freeze({
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          accept: stream ? "text/event-stream" : "application/json",
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/v1/messages`,
          headers: Object.freeze({
            "content-type": "application/json",
            "x-api-key": "[REDACTED]",
            "anthropic-version": "2023-06-01",
          }),
          body: Object.freeze({
            model: body.model,
            max_tokens: body.max_tokens,
            stream: body.stream,
            ...(system ? { system: "[REDACTED]" } : {}),
            ...(anthropicTools ? { tools: anthropicTools.map((tool) => tool.name) } : {}),
            messages: "[REDACTED]",
          }),
        }),
      });
    }
    case "openai":
    case "openai-compatible": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "OpenAI API key is required.");
      const body = {
        model,
        messages: toOpenAiMessages(messages),
        stream: stream === true,
      };
      if (tokens !== undefined) body.max_tokens = tokens;
      const openAiTools = toOpenAiTools(tools);
      if (openAiTools) body.tools = openAiTools;
      return Object.freeze({
        method: "POST",
        url: `${base}/v1/chat/completions`,
        headers: Object.freeze({
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          accept: stream ? "text/event-stream" : "application/json",
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/v1/chat/completions`,
          headers: Object.freeze({
            "content-type": "application/json",
            authorization: "[REDACTED]",
          }),
          body: Object.freeze({
            model: body.model,
            stream: body.stream,
            ...(tokens !== undefined ? { max_tokens: tokens } : {}),
            ...(openAiTools ? { tools: openAiTools.map((tool) => tool.function.name) } : {}),
            messages: "[REDACTED]",
          }),
        }),
      });
    }
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function buildPromptRequest({
  protocol,
  endpoint,
  apiKey,
  model,
  prompt,
  maxTokens,
  stream = false,
}) {
  assertProtocol(protocol);
  if (typeof prompt !== "string" || prompt.length === 0) {
    throw protocolError("INVALID_REQUEST", "Prompt must be a non-empty string.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw protocolError("INVALID_REQUEST", "Model must be a non-empty string.");
  }

  const base = resolveEndpoint(protocol, endpoint);
  const tokens = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : undefined;

  switch (protocol) {
    case "anthropic": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "Anthropic API key is required.");
      const body = {
        model,
        max_tokens: tokens ?? 4096,
        messages: [{ role: "user", content: prompt }],
        stream: stream === true,
      };
      return Object.freeze({
        method: "POST",
        url: `${base}/v1/messages`,
        headers: Object.freeze({
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          accept: stream ? "text/event-stream" : "application/json",
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/v1/messages`,
          headers: Object.freeze({
            "content-type": "application/json",
            "x-api-key": "[REDACTED]",
            "anthropic-version": "2023-06-01",
          }),
          body: Object.freeze({ ...body, messages: [{ role: "user", content: "[REDACTED]" }] }),
        }),
      });
    }
    case "openai":
    case "openai-compatible": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "OpenAI API key is required.");
      const body = {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: stream === true,
      };
      if (tokens !== undefined) body.max_tokens = tokens;
      return Object.freeze({
        method: "POST",
        url: `${base}/v1/chat/completions`,
        headers: Object.freeze({
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          accept: stream ? "text/event-stream" : "application/json",
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/v1/chat/completions`,
          headers: Object.freeze({
            "content-type": "application/json",
            authorization: "[REDACTED]",
          }),
          body: Object.freeze({
            ...body,
            messages: [{ role: "user", content: "[REDACTED]" }],
          }),
        }),
      });
    }
    case "google-ai": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "Google AI API key is required.");
      const modelId = model.replace(/^models\//u, "");
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (tokens !== undefined) {
        body.generationConfig = { maxOutputTokens: tokens };
      }
      const url = `${base}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;
      return Object.freeze({
        method: "POST",
        url,
        headers: Object.freeze({
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url,
          headers: Object.freeze({
            "content-type": "application/json",
            "x-goog-api-key": "[REDACTED]",
          }),
          body: Object.freeze({
            contents: [{ parts: [{ text: "[REDACTED]" }] }],
            ...(body.generationConfig ? { generationConfig: body.generationConfig } : {}),
          }),
        }),
      });
    }
    case "ollama": {
      const body = {
        model,
        prompt,
        stream: stream === true,
      };
      if (tokens !== undefined) body.options = { num_predict: tokens };
      return Object.freeze({
        method: "POST",
        url: `${base}/api/generate`,
        headers: Object.freeze({
          "content-type": "application/json",
        }),
        body,
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/api/generate`,
          headers: Object.freeze({ "content-type": "application/json" }),
          body: Object.freeze({ ...body, prompt: "[REDACTED]" }),
        }),
      });
    }
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function buildDiscoveryRequest({ protocol, endpoint, apiKey }) {
  assertProtocol(protocol);
  const base = resolveEndpoint(protocol, endpoint);

  switch (protocol) {
    case "anthropic":
      return Object.freeze({
        kind: "curated",
        models: ANTHROPIC_CURATED_MODELS.slice(),
        logSafe: Object.freeze({ kind: "curated", protocol }),
      });
    case "openai":
    case "openai-compatible": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "API key is required for model discovery.");
      return Object.freeze({
        kind: "http",
        method: "GET",
        url: `${base}/v1/models`,
        headers: Object.freeze({
          authorization: `Bearer ${apiKey}`,
        }),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/v1/models`,
          headers: Object.freeze({ authorization: "[REDACTED]" }),
        }),
      });
    }
    case "google-ai": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "API key is required for model discovery.");
      return Object.freeze({
        kind: "http",
        method: "GET",
        url: `${base}/v1beta/models`,
        headers: Object.freeze({
          "x-goog-api-key": apiKey,
        }),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/v1beta/models`,
          headers: Object.freeze({ "x-goog-api-key": "[REDACTED]" }),
        }),
      });
    }
    case "ollama":
      return Object.freeze({
        kind: "http",
        method: "GET",
        url: `${base}/api/tags`,
        headers: Object.freeze({}),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/api/tags`,
          headers: Object.freeze({}),
        }),
      });
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function buildConnectionTestRequest({ protocol, endpoint, apiKey }) {
  assertProtocol(protocol);
  const base = resolveEndpoint(protocol, endpoint);

  switch (protocol) {
    case "anthropic": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "Anthropic API key is required.");
      // Minimal token ping — not discovery, not a user prompt pipeline.
      return Object.freeze({
        method: "POST",
        url: `${base}/v1/messages`,
        headers: Object.freeze({
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        }),
        body: Object.freeze({
          model: ANTHROPIC_CURATED_MODELS[0],
          max_tokens: 1,
          messages: [{ role: "user", content: "." }],
        }),
        logSafe: Object.freeze({
          method: "POST",
          url: `${base}/v1/messages`,
          headers: Object.freeze({
            "content-type": "application/json",
            "x-api-key": "[REDACTED]",
            "anthropic-version": "2023-06-01",
          }),
        }),
      });
    }
    case "openai":
    case "openai-compatible": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "API key is required.");
      return Object.freeze({
        method: "GET",
        url: `${base}/v1/models`,
        headers: Object.freeze({ authorization: `Bearer ${apiKey}` }),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/v1/models`,
          headers: Object.freeze({ authorization: "[REDACTED]" }),
        }),
      });
    }
    case "google-ai": {
      if (!apiKey) throw protocolError("MISSING_API_KEY", "API key is required.");
      return Object.freeze({
        method: "GET",
        url: `${base}/v1beta/models`,
        headers: Object.freeze({ "x-goog-api-key": apiKey }),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/v1beta/models`,
          headers: Object.freeze({ "x-goog-api-key": "[REDACTED]" }),
        }),
      });
    }
    case "ollama":
      return Object.freeze({
        method: "GET",
        url: `${base}/api/tags`,
        headers: Object.freeze({}),
        logSafe: Object.freeze({
          method: "GET",
          url: `${base}/api/tags`,
          headers: Object.freeze({}),
        }),
      });
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function parseNonStreamResponse(protocol, json) {
  assertProtocol(protocol);
  if (!json || typeof json !== "object") {
    throw protocolError("MALFORMED_RESPONSE", "Response JSON must be an object.");
  }

  switch (protocol) {
    case "anthropic": {
      const content = json.content;
      if (!Array.isArray(content)) {
        throw protocolError("MALFORMED_RESPONSE", "Anthropic response missing content blocks.");
      }
      const text = content
        .map((block) => (block && typeof block.text === "string" ? block.text : ""))
        .join("");
      const toolCalls = content
        .filter((block) => block && block.type === "tool_use" && typeof block.name === "string")
        .map((block) => Object.freeze({
          id: typeof block.id === "string" ? block.id : `tool-${Math.random().toString(36).slice(2)}`,
          name: block.name,
          arguments: block.input && typeof block.input === "object" ? block.input : {},
        }));
      return Object.freeze({
        text,
        finishReason: json.stop_reason ?? null,
        toolCalls: Object.freeze(toolCalls),
      });
    }
    case "openai":
    case "openai-compatible": {
      const choice = Array.isArray(json.choices) ? json.choices[0] : null;
      const message = choice?.message;
      const text = typeof message?.content === "string" ? message.content : "";
      if (message?.content != null && typeof message.content !== "string") {
        throw protocolError("MALFORMED_RESPONSE", "OpenAI response missing choices.message.content.");
      }
      const toolCalls = Array.isArray(message?.tool_calls)
        ? message.tool_calls
          .filter((call) => call && typeof call.function?.name === "string")
          .map((call) => {
            let args = call.function?.arguments;
            if (typeof args === "string") {
              try { args = JSON.parse(args); } catch { args = {}; }
            }
            if (!args || typeof args !== "object") args = {};
            return Object.freeze({
              id: typeof call.id === "string" ? call.id : `tool-${Math.random().toString(36).slice(2)}`,
              name: call.function.name,
              arguments: args,
            });
          })
        : [];
      if (typeof message?.content !== "string" && toolCalls.length === 0) {
        throw protocolError("MALFORMED_RESPONSE", "OpenAI response missing choices.message.content.");
      }
      return Object.freeze({
        text,
        finishReason: choice?.finish_reason ?? null,
        toolCalls: Object.freeze(toolCalls),
      });
    }
    case "google-ai": {
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw protocolError("MALFORMED_RESPONSE", "Google AI response missing candidates text.");
      }
      return Object.freeze({ text, finishReason: json.candidates[0].finishReason ?? null, toolCalls: Object.freeze([]) });
    }
    case "ollama": {
      if (typeof json.response !== "string") {
        throw protocolError("MALFORMED_RESPONSE", "Ollama response missing response field.");
      }
      return Object.freeze({ text: json.response, finishReason: json.done ? "stop" : null, toolCalls: Object.freeze([]) });
    }
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function parseStreamEvent(protocol, eventPayload) {
  assertProtocol(protocol);
  if (eventPayload == null || eventPayload === "[DONE]") {
    return Object.freeze({ kind: "done", text: "" });
  }

  let json = eventPayload;
  if (typeof eventPayload === "string") {
    try {
      json = JSON.parse(eventPayload);
    } catch {
      throw protocolError("MALFORMED_RESPONSE", "Malformed SSE JSON payload.");
    }
  }

  switch (protocol) {
    case "anthropic": {
      const type = json.type;
      if (type === "content_block_delta" && typeof json.delta?.text === "string") {
        return Object.freeze({ kind: "delta", text: json.delta.text });
      }
      if (type === "message_stop" || type === "message_delta") {
        return Object.freeze({ kind: type === "message_stop" ? "done" : "delta", text: "" });
      }
      return Object.freeze({ kind: "ignore", text: "" });
    }
    case "openai":
    case "openai-compatible": {
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        return Object.freeze({ kind: "delta", text: delta });
      }
      if (json?.choices?.[0]?.finish_reason) {
        return Object.freeze({ kind: "done", text: "" });
      }
      return Object.freeze({ kind: "ignore", text: "" });
    }
    case "ollama": {
      if (typeof json.response === "string" && json.response.length > 0) {
        return Object.freeze({ kind: "delta", text: json.response });
      }
      if (json.done === true) return Object.freeze({ kind: "done", text: "" });
      return Object.freeze({ kind: "ignore", text: "" });
    }
    case "google-ai":
      // Google streaming uses a different wire format; non-stream is primary.
      return Object.freeze({ kind: "ignore", text: "" });
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function parseModelList(protocol, json) {
  assertProtocol(protocol);

  switch (protocol) {
    case "anthropic":
      return ANTHROPIC_CURATED_MODELS.slice();
    case "openai": {
      if (!Array.isArray(json?.data)) {
        throw protocolError("MALFORMED_RESPONSE", "OpenAI model list missing data.");
      }
      const prefixes = ["gpt-", "o1-", "o3-", "o4-", "chatgpt-"];
      const exact = new Set(["o1", "o3", "o4"]);
      return json.data
        .map((entry) => entry?.id)
        .filter((id) => typeof id === "string")
        .filter((id) => prefixes.some((prefix) => id.startsWith(prefix)) || exact.has(id))
        .sort();
    }
    case "openai-compatible": {
      if (!Array.isArray(json?.data)) {
        throw protocolError("MALFORMED_RESPONSE", "Compatible model list missing data.");
      }
      return json.data
        .map((entry) => entry?.id)
        .filter((id) => typeof id === "string")
        .sort();
    }
    case "google-ai": {
      if (!Array.isArray(json?.models)) {
        throw protocolError("MALFORMED_RESPONSE", "Google AI model list missing models.");
      }
      return json.models
        .filter((entry) => {
          const methods = entry?.supportedGenerationMethods;
          return Array.isArray(methods) && methods.includes("generateContent");
        })
        .map((entry) => {
          const name = entry?.name;
          if (typeof name !== "string") return null;
          return name.replace(/^models\//u, "");
        })
        .filter(Boolean)
        .sort();
    }
    case "ollama": {
      if (!Array.isArray(json?.models)) {
        throw protocolError("MALFORMED_RESPONSE", "Ollama model list missing models.");
      }
      return json.models
        .map((entry) => entry?.name)
        .filter((name) => typeof name === "string");
    }
    default:
      throw protocolError("UNKNOWN_PROTOCOL", `Unknown REST protocol: ${protocol}`);
  }
}

function safeHttpErrorMessage(status, bodyText) {
  const redacted = redactSecrets(typeof bodyText === "string" ? bodyText.slice(0, 512) : "");
  return `HTTP ${status}: ${redacted}`;
}

module.exports = {
  ANTHROPIC_CURATED_MODELS,
  DEFAULT_ENDPOINTS,
  NIA_REST_PROTOCOL_ERROR_CODES,
  NIA_REST_PROTOCOL_IDS,
  NiaRestProtocolError,
  buildChatRequest,
  buildConnectionTestRequest,
  buildDiscoveryRequest,
  buildPromptRequest,
  normalizeRestBase,
  parseModelList,
  parseNonStreamResponse,
  parseStreamEvent,
  redactSecrets,
  resolveEndpoint,
  safeHttpErrorMessage,
};
