import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  ALLOWED_REQUEST_HEADER_NAMES,
  NiaRestProviderError,
  createNiaRestProvider,
} = require("../../../../electron/nia/nia-rest-provider.cjs");

const REST_PROVIDER = Object.freeze({
  id: "openai-default",
  kind: "rest",
  protocol: "openai",
  label: "OpenAI",
  enabled: true,
  endpoint: "https://api.openai.com",
  defaultModel: "gpt-4o",
  supportedModels: ["gpt-4o"],
  capabilities: {
    streaming: true,
    toolModeDisable: true,
    cancellation: true,
    attachments: false,
    maxInputTokens: 128_000,
    maxOutputTokens: 2_048,
  },
  bounds: { timeoutMs: 5_000, maxOutputBytes: 4_096 },
});

function jsonResponse(body: unknown, init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Map<string, string>([
    ["content-type", init.contentType || "application/json"],
    ...Object.entries(init.headers || {}),
  ]);
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: {
      get(name: string) {
        return headers.get(String(name).toLowerCase()) ?? null;
      },
    },
    async text() {
      return text;
    },
  };
}

describe("nia-rest-provider", () => {
  it("exposes a frozen request header allowlist", () => {
    expect([...ALLOWED_REQUEST_HEADER_NAMES]).toEqual([
      "accept",
      "anthropic-version",
      "authorization",
      "content-type",
      "x-api-key",
      "x-goog-api-key",
    ]);
    expect(Object.isFrozen(ALLOWED_REQUEST_HEADER_NAMES)).toBe(true);
  });

  it("rejects non-HTTPS remote endpoints and non-loopback HTTP", () => {
    const provider = createNiaRestProvider();
    expect(() =>
      provider.assertAllowedDestination("http://example.com/v1", {
        protocol: "openai",
        allowOllamaHttp: false,
      }),
    ).toThrow(NiaRestProviderError);

    expect(() =>
      provider.assertAllowedDestination("http://192.168.1.10:11434", {
        protocol: "ollama",
        allowOllamaHttp: true,
      }),
    ).toThrow(/loopback/i);

    expect(() =>
      provider.assertAllowedDestination("http://127.0.0.1:11434/api/generate", {
        protocol: "ollama",
        allowOllamaHttp: true,
      }),
    ).not.toThrow();
  });

  it("executes a fixed HTTPS prompt and strips disallowed headers", async () => {
    const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init.headers["x-custom-evil"]).toBeUndefined();
      expect(init.headers.authorization).toMatch(/^Bearer /);
      return jsonResponse({
        choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
      });
    });
    const rest = createNiaRestProvider({ fetchImpl });
    const result = await rest.executePrompt({
      provider: REST_PROVIDER,
      apiKey: "sk-test-key-abcdefghijklmnop",
      model: "gpt-4o",
      prompt: "ping",
      stream: false,
    });
    expect(result.text).toBe("pong");
    expect(JSON.stringify(result.logSafe)).not.toContain("sk-test-key");
  });

  it("parses SSE streaming chunks and enforces response size caps", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    const fetchImpl = vi.fn(async () =>
      jsonResponse(sse, { contentType: "text/event-stream" }),
    );
    const rest = createNiaRestProvider({ fetchImpl });
    const deltas: string[] = [];
    const result = await rest.executePrompt({
      provider: REST_PROVIDER,
      apiKey: "sk-test-key-abcdefghijklmnop",
      model: "gpt-4o",
      prompt: "stream",
      stream: true,
      onDelta: (chunk: string) => deltas.push(chunk),
    });
    expect(deltas.join("")).toBe("Hello");
    expect(result.text).toBe("Hello");

    const huge = createNiaRestProvider({
      fetchImpl: vi.fn(async () => jsonResponse("x".repeat(8_192))),
    });
    await expect(
      huge.executePrompt({
        provider: REST_PROVIDER,
        apiKey: "sk-test-key-abcdefghijklmnop",
        model: "gpt-4o",
        prompt: "big",
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("maps timeout, cancel, non-2xx, and redirect destination failures", async () => {
    const timeoutProvider = {
      ...REST_PROVIDER,
      bounds: { timeoutMs: 20, maxOutputBytes: 4_096 },
    };
    const hang = createNiaRestProvider({
      fetchImpl: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), 5);
          }),
      ),
    });
    await expect(
      hang.executePrompt({
        provider: timeoutProvider,
        apiKey: "sk-test-key-abcdefghijklmnop",
        model: "gpt-4o",
        prompt: "hang",
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    const controller = new AbortController();
    controller.abort();
    const cancelled = createNiaRestProvider({
      fetchImpl: vi.fn(async () => jsonResponse({ choices: [{ message: { content: "no" } }] })),
    });
    await expect(
      cancelled.executePrompt({
        provider: REST_PROVIDER,
        apiKey: "sk-test-key-abcdefghijklmnop",
        model: "gpt-4o",
        prompt: "stop",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });

    const httpError = createNiaRestProvider({
      fetchImpl: vi.fn(async () =>
        jsonResponse(`{"error":"nope sk-abcdefghijklmnopqrstuvwxyz"}`, { status: 401 }),
      ),
    });
    await expect(
      httpError.executePrompt({
        provider: REST_PROVIDER,
        apiKey: "sk-test-key-abcdefghijklmnop",
        model: "gpt-4o",
        prompt: "fail",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      message: expect.not.stringContaining("sk-abcdefghijklmnopqrstuvwxyz"),
    });

    const redirect = createNiaRestProvider({
      fetchImpl: vi.fn(async () =>
        jsonResponse("", {
          status: 302,
          headers: { location: "http://evil.example/steal" },
        }),
      ),
    });
    await expect(
      redirect.executePrompt({
        provider: REST_PROVIDER,
        apiKey: "sk-test-key-abcdefghijklmnop",
        model: "gpt-4o",
        prompt: "redirect",
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_DESTINATION_REJECTED" });
  });

  it("retries once on transport errors then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket reset"))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "recovered" }, finish_reason: "stop" }],
        }),
      );
    const rest = createNiaRestProvider({ fetchImpl, maxRetries: 1 });
    const result = await rest.executePrompt({
      provider: REST_PROVIDER,
      apiKey: "sk-test-key-abcdefghijklmnop",
      model: "gpt-4o",
      prompt: "retry",
    });
    expect(result.text).toBe("recovered");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
