import { describe, expect, it } from "vitest";

import {
  NIA_CLI_ADAPTER_IDS,
  NIA_PROVIDER_CAPABILITY_KEYS,
  NIA_PROVIDER_LIMITS,
  NIA_REST_PROTOCOLS,
  type NiaProviderCapabilities,
} from "@/features/nia/provider-contract";
import {
  NiaProviderSchemaError,
  parseCliProviderDraft,
  parseRestProviderDraft,
  resolveDefinitionModelOverride,
  validateProviderCapabilities,
} from "@/features/nia/provider-schema";

const BASE_CAPABILITIES: NiaProviderCapabilities = {
  streaming: true,
  toolModeDisable: true,
  cancellation: true,
  attachments: false,
  maxInputTokens: 128_000,
  maxOutputTokens: 8_192,
};

describe("provider-schema REST drafts", () => {
  it("accepts a bounded HTTPS REST provider draft", () => {
    const parsed = parseRestProviderDraft({
      id: "anthropic-default",
      kind: "rest",
      protocol: "anthropic",
      label: "Anthropic",
      enabled: true,
      endpoint: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      supportedModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
      capabilities: BASE_CAPABILITIES,
    });
    expect(parsed.kind).toBe("rest");
    expect(parsed.protocol).toBe("anthropic");
    expect(parsed.bounds.timeoutMs).toBe(NIA_PROVIDER_LIMITS.timeoutMs.default);
    expect(parsed.bounds.maxOutputBytes).toBe(NIA_PROVIDER_LIMITS.maxOutputBytes.default);
    expect(parsed.rememberOnThisMac).toBe(false);
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("token");
  });

  it("applies bounded defaults and clamps within limits", () => {
    const parsed = parseRestProviderDraft({
      id: "openai-default",
      kind: "rest",
      protocol: "openai",
      label: "OpenAI",
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      defaultModel: "gpt-4o",
      supportedModels: ["gpt-4o"],
      capabilities: BASE_CAPABILITIES,
      bounds: {
        timeoutMs: 12_000,
        maxOutputBytes: 4096,
      },
    });
    expect(parsed.bounds.timeoutMs).toBe(12_000);
    expect(parsed.bounds.maxOutputBytes).toBe(4096);
  });

  it("rejects unbounded timeout and output", () => {
    expect(() =>
      parseRestProviderDraft({
        id: "openai-default",
        kind: "rest",
        protocol: "openai",
        label: "OpenAI",
        enabled: true,
        endpoint: "https://api.openai.com/v1",
        defaultModel: "gpt-4o",
        supportedModels: ["gpt-4o"],
        capabilities: BASE_CAPABILITIES,
        bounds: { timeoutMs: NIA_PROVIDER_LIMITS.timeoutMs.max + 1, maxOutputBytes: 1024 },
      }),
    ).toThrow(NiaProviderSchemaError);

    expect(() =>
      parseRestProviderDraft({
        id: "openai-default",
        kind: "rest",
        protocol: "openai",
        label: "OpenAI",
        enabled: true,
        endpoint: "https://api.openai.com/v1",
        defaultModel: "gpt-4o",
        supportedModels: ["gpt-4o"],
        capabilities: BASE_CAPABILITIES,
        bounds: { timeoutMs: 5000, maxOutputBytes: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(NiaProviderSchemaError);
  });

  it("rejects URL credentials and non-HTTPS remote REST endpoints", () => {
    expect(() =>
      parseRestProviderDraft({
        id: "bad-creds",
        kind: "rest",
        protocol: "openai-compatible",
        label: "Bad",
        enabled: true,
        endpoint: "https://user:pass@api.example.com/v1",
        defaultModel: "gpt-4o",
        supportedModels: ["gpt-4o"],
        capabilities: BASE_CAPABILITIES,
      }),
    ).toThrowError(expect.objectContaining({ code: "URL_CREDENTIAL_REJECTED" }));

    expect(() =>
      parseRestProviderDraft({
        id: "http-remote",
        kind: "rest",
        protocol: "openai-compatible",
        label: "Bad",
        enabled: true,
        endpoint: "http://api.example.com/v1",
        defaultModel: "gpt-4o",
        supportedModels: ["gpt-4o"],
        capabilities: BASE_CAPABILITIES,
      }),
    ).toThrowError(expect.objectContaining({ code: "NON_HTTPS_ENDPOINT_REJECTED" }));
  });

  it("allows Ollama loopback HTTP only", () => {
    const parsed = parseRestProviderDraft({
      id: "ollama-local",
      kind: "rest",
      protocol: "ollama",
      label: "Ollama",
      enabled: true,
      endpoint: "http://127.0.0.1:11434",
      defaultModel: "llama3.2",
      supportedModels: ["llama3.2"],
      capabilities: BASE_CAPABILITIES,
    });
    expect(parsed.endpoint).toBe("http://127.0.0.1:11434");

    expect(() =>
      parseRestProviderDraft({
        id: "ollama-remote",
        kind: "rest",
        protocol: "ollama",
        label: "Ollama",
        enabled: true,
        endpoint: "http://192.168.1.50:11434",
        defaultModel: "llama3.2",
        supportedModels: ["llama3.2"],
        capabilities: BASE_CAPABILITIES,
      }),
    ).toThrowError(expect.objectContaining({ code: "NON_HTTPS_ENDPOINT_REJECTED" }));
  });

  it("rejects plaintext secret fields in drafts", () => {
    expect(() =>
      parseRestProviderDraft({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: BASE_CAPABILITIES,
        apiKey: "sk-live-secret",
      }),
    ).toThrowError(expect.objectContaining({ code: "PLAINTEXT_SECRET_REJECTED" }));
  });

  it("enumerates only known REST protocols", () => {
    expect(NIA_REST_PROTOCOLS).toEqual([
      "anthropic",
      "openai",
      "openai-compatible",
      "google-ai",
      "ollama",
    ]);
    expect(() =>
      parseRestProviderDraft({
        id: "unknown",
        kind: "rest",
        protocol: "custom-protocol",
        label: "Bad",
        enabled: true,
        endpoint: "https://api.example.com",
        defaultModel: "x",
        supportedModels: ["x"],
        capabilities: BASE_CAPABILITIES,
      }),
    ).toThrow(NiaProviderSchemaError);
  });
});

describe("provider-schema CLI drafts", () => {
  it("accepts only fixed audited adapter IDs", () => {
    expect(NIA_CLI_ADAPTER_IDS).toEqual(["claude", "codex", "gemini"]);
    const parsed = parseCliProviderDraft({
      id: "claude-cli",
      kind: "cli",
      adapterId: "claude",
      label: "Claude CLI",
      enabled: true,
      defaultModel: "claude-sonnet-4-5",
      supportedModels: ["claude-sonnet-4-5"],
      capabilities: {
        ...BASE_CAPABILITIES,
        toolModeDisable: true,
        independentToolAuthority: false,
      },
    });
    expect(parsed.adapterId).toBe("claude");
    expect(parsed).not.toHaveProperty("executablePath");
    expect(parsed).not.toHaveProperty("argv");
    expect(parsed).not.toHaveProperty("shell");
    expect(parsed).not.toHaveProperty("cwd");
    expect(parsed).not.toHaveProperty("env");
  });

  it("rejects user-supplied executable path, raw flags, shell, env, and cwd", () => {
    const base = {
      id: "claude-cli",
      kind: "cli" as const,
      adapterId: "claude" as const,
      label: "Claude CLI",
      enabled: true,
      defaultModel: "claude-sonnet-4-5",
      supportedModels: ["claude-sonnet-4-5"],
      capabilities: {
        ...BASE_CAPABILITIES,
        independentToolAuthority: false,
      },
    };

    expect(() =>
      parseCliProviderDraft({ ...base, executablePath: "/usr/local/bin/claude" }),
    ).toThrowError(expect.objectContaining({ code: "USER_EXECUTABLE_REJECTED" }));

    expect(() =>
      parseCliProviderDraft({ ...base, rawFlags: ["--dangerously-skip-permissions"] }),
    ).toThrowError(expect.objectContaining({ code: "USER_RAW_FLAGS_REJECTED" }));

    expect(() =>
      parseCliProviderDraft({ ...base, shell: "claude --print" }),
    ).toThrowError(expect.objectContaining({ code: "USER_SHELL_REJECTED" }));

    expect(() =>
      parseCliProviderDraft({ ...base, envNames: ["ANTHROPIC_API_KEY"] }),
    ).toThrowError(expect.objectContaining({ code: "USER_ENV_REJECTED" }));

    expect(() =>
      parseCliProviderDraft({ ...base, cwd: "/Users/me/workspace" }),
    ).toThrowError(expect.objectContaining({ code: "USER_CWD_REJECTED" }));

    expect(() =>
      parseCliProviderDraft({ ...base, adapterId: "custom-bin" }),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_CLI_ADAPTER" }));
  });
});

describe("provider-schema capabilities and model override", () => {
  it("rejects unknown capability keys", () => {
    expect(NIA_PROVIDER_CAPABILITY_KEYS).toEqual([
      "streaming",
      "toolModeDisable",
      "cancellation",
      "attachments",
      "maxInputTokens",
      "maxOutputTokens",
      "independentToolAuthority",
      "riskAccepted",
    ]);
    expect(() =>
      validateProviderCapabilities({
        ...BASE_CAPABILITIES,
        arbitraryTool: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_CAPABILITY" }));
  });

  it("requires explicit risk acceptance when independent tool authority is unavoidable", () => {
    expect(() =>
      validateProviderCapabilities({
        ...BASE_CAPABILITIES,
        toolModeDisable: false,
        independentToolAuthority: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "RISK_ACCEPTANCE_REQUIRED" }));

    const accepted = validateProviderCapabilities({
      ...BASE_CAPABILITIES,
      toolModeDisable: false,
      independentToolAuthority: true,
      riskAccepted: true,
    });
    expect(accepted.riskAccepted).toBe(true);
  });

  it("allows a definition model override only when the provider reports it as supported", () => {
    const provider = parseRestProviderDraft({
      id: "anthropic-default",
      kind: "rest",
      protocol: "anthropic",
      label: "Anthropic",
      enabled: true,
      endpoint: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      supportedModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
      capabilities: BASE_CAPABILITIES,
    });

    expect(
      resolveDefinitionModelOverride(provider, "claude-haiku-4-5"),
    ).toEqual({ model: "claude-haiku-4-5", overridden: true });

    expect(
      resolveDefinitionModelOverride(provider, undefined),
    ).toEqual({ model: "claude-sonnet-4-5", overridden: false });

    expect(() =>
      resolveDefinitionModelOverride(provider, "gpt-4o"),
    ).toThrowError(expect.objectContaining({ code: "MODEL_NOT_SUPPORTED" }));
  });
});
