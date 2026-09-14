import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  ANTHROPIC_CURATED_MODELS,
  NIA_REST_PROTOCOL_IDS,
  buildDiscoveryRequest,
  buildPromptRequest,
  parseModelList,
  parseNonStreamResponse,
  parseStreamEvent,
  redactSecrets,
  safeHttpErrorMessage,
} = require("../../../../electron/nia/nia-rest-protocols.cjs");

const SECRET = "sk-abcdefghijklmnopqrstuvwxyz0123456789";

describe("nia-rest-protocols", () => {
  it("freezes the supported protocol list", () => {
    expect([...NIA_REST_PROTOCOL_IDS]).toEqual([
      "anthropic",
      "openai",
      "openai-compatible",
      "google-ai",
      "ollama",
    ]);
    expect(Object.isFrozen(NIA_REST_PROTOCOL_IDS)).toBe(true);
  });

  it.each([
    {
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
      urlSuffix: "/v1/messages",
      headerKey: "x-api-key",
    },
    {
      protocol: "openai",
      endpoint: "https://api.openai.com",
      urlSuffix: "/v1/chat/completions",
      headerKey: "authorization",
    },
    {
      protocol: "openai-compatible",
      endpoint: "https://example.com/v1",
      urlSuffix: "/v1/chat/completions",
      headerKey: "authorization",
    },
    {
      protocol: "google-ai",
      endpoint: "https://generativelanguage.googleapis.com",
      urlSuffix: "/v1beta/models/gemini-2.0-flash:generateContent",
      headerKey: "x-goog-api-key",
    },
  ] as const)("builds $protocol prompt request without leaking secrets in logSafe", ({
    protocol,
    endpoint,
    urlSuffix,
    headerKey,
  }) => {
    const request = buildPromptRequest({
      protocol,
      endpoint,
      apiKey: SECRET,
      model: protocol === "google-ai" ? "gemini-2.0-flash" : "gpt-test",
      prompt: "hello secret prompt",
      maxTokens: 128,
      stream: false,
    });
    expect(request.url).toContain(urlSuffix);
    expect(request.headers[headerKey]).toContain(SECRET.replace("sk-", "") === SECRET.slice(3) ? SECRET : "");
    expect(JSON.stringify(request.logSafe)).not.toContain(SECRET);
    expect(JSON.stringify(request.logSafe)).not.toContain("hello secret prompt");
    expect(request.logSafe.headers[headerKey]).toBe("[REDACTED]");
  });

  it("builds ollama generate request without requiring an API key", () => {
    const request = buildPromptRequest({
      protocol: "ollama",
      endpoint: "http://127.0.0.1:11434",
      model: "llama3.2",
      prompt: "ping",
      stream: true,
    });
    expect(request.url).toBe("http://127.0.0.1:11434/api/generate");
    expect(request.body).toMatchObject({ model: "llama3.2", stream: true });
    expect(request.logSafe.body.prompt).toBe("[REDACTED]");
  });

  it("parses non-stream responses for each protocol", () => {
    expect(
      parseNonStreamResponse("anthropic", {
        content: [{ type: "text", text: "A" }, { type: "text", text: "B" }],
        stop_reason: "end_turn",
      }),
    ).toEqual({ text: "AB", finishReason: "end_turn", toolCalls: [] });

    expect(
      parseNonStreamResponse("openai", {
        choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
      }),
    ).toEqual({ text: "hi", finishReason: "stop", toolCalls: [] });

    expect(
      parseNonStreamResponse("openai-compatible", {
        choices: [{ message: { content: "ok" }, finish_reason: "length" }],
      }),
    ).toEqual({ text: "ok", finishReason: "length", toolCalls: [] });

    expect(
      parseNonStreamResponse("google-ai", {
        candidates: [{ content: { parts: [{ text: "g" }] }, finishReason: "STOP" }],
      }),
    ).toEqual({ text: "g", finishReason: "STOP", toolCalls: [] });

    expect(
      parseNonStreamResponse("ollama", { response: "local", done: true }),
    ).toEqual({ text: "local", finishReason: "stop", toolCalls: [] });
  });

  it("parses streaming deltas and rejects malformed SSE JSON", () => {
    expect(
      parseStreamEvent(
        "anthropic",
        JSON.stringify({ type: "content_block_delta", delta: { text: "Δ" } }),
      ),
    ).toEqual({ kind: "delta", text: "Δ" });

    expect(
      parseStreamEvent(
        "openai",
        JSON.stringify({ choices: [{ delta: { content: "x" } }] }),
      ),
    ).toEqual({ kind: "delta", text: "x" });

    expect(
      parseStreamEvent("ollama", JSON.stringify({ response: "y", done: false })),
    ).toEqual({ kind: "delta", text: "y" });

    expect(parseStreamEvent("openai", "[DONE]")).toEqual({ kind: "done", text: "" });
    expect(() => parseStreamEvent("openai", "{not-json")).toThrow(/Malformed SSE/);
  });

  it("rejects malformed non-stream shapes", () => {
    expect(() => parseNonStreamResponse("anthropic", { content: "nope" })).toThrow(/content/);
    expect(() => parseNonStreamResponse("openai", { choices: [] })).toThrow(/choices/);
    expect(() => parseNonStreamResponse("google-ai", { candidates: [] })).toThrow(/candidates/);
    expect(() => parseNonStreamResponse("ollama", { done: true })).toThrow(/response/);
  });

  it("supports curated anthropic discovery and capped remote model lists", () => {
    const curated = buildDiscoveryRequest({
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
      apiKey: SECRET,
    });
    expect(curated.kind).toBe("curated");
    expect(curated.models).toEqual([...ANTHROPIC_CURATED_MODELS]);
    expect(JSON.stringify(curated.logSafe)).not.toContain(SECRET);

    const openaiDiscovery = buildDiscoveryRequest({
      protocol: "openai",
      endpoint: "https://api.openai.com",
      apiKey: SECRET,
    });
    expect(openaiDiscovery.url).toBe("https://api.openai.com/v1/models");
    expect(openaiDiscovery.logSafe.headers.authorization).toBe("[REDACTED]");

    expect(
      parseModelList("openai", {
        data: [{ id: "gpt-4o" }, { id: "davinci" }, { id: "o1" }],
      }),
    ).toEqual(["gpt-4o", "o1"]);
  });

  it("redacts secrets from logs and HTTP error messages", () => {
    expect(redactSecrets(`Authorization: Bearer ${SECRET}`)).not.toContain(SECRET);
    expect(safeHttpErrorMessage(401, `{"error":"bad key ${SECRET}"}`)).not.toContain(SECRET);
    expect(safeHttpErrorMessage(500, "x".repeat(2_000)).length).toBeLessThan(600);
  });

  it("builds chat requests with tools and parses tool calls", () => {
    const { buildChatRequest } = require("../../../../electron/nia/nia-rest-protocols.cjs");
    const tools = [{
      name: "auris_browser",
      description: "Browse",
      parameters: { type: "object", properties: { action: { type: "string" } } },
    }];
    const openai = buildChatRequest({
      protocol: "openai",
      endpoint: "https://api.openai.com",
      apiKey: SECRET,
      model: "gpt-4o",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "open example.com" },
      ],
      tools,
    });
    expect(openai.body.tools[0].function.name).toBe("auris_browser");
    expect(JSON.stringify(openai.logSafe)).not.toContain(SECRET);

    const parsed = parseNonStreamResponse("openai", {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "auris_browser",
              arguments: JSON.stringify({ action: "open", url: "https://example.com/" }),
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    expect(parsed.toolCalls).toEqual([{
      id: "call-1",
      name: "auris_browser",
      arguments: { action: "open", url: "https://example.com/" },
    }]);

    const anthropic = parseNonStreamResponse("anthropic", {
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Opening" },
        { type: "tool_use", id: "tu-1", name: "auris_browser", input: { action: "read" } },
      ],
    });
    expect(anthropic.text).toBe("Opening");
    expect(anthropic.toolCalls[0]).toMatchObject({ id: "tu-1", name: "auris_browser" });
  });
});
