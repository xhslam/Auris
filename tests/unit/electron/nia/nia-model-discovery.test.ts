import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  NIA_MODEL_DISCOVERY_LIMITS,
  createNiaModelDiscovery,
} = require("../../../../electron/nia/nia-model-discovery.cjs");

describe("nia-model-discovery", () => {
  it("returns curated anthropic models without network and without logging secrets", async () => {
    const fetchImpl = vi.fn();
    const discovery = createNiaModelDiscovery({ fetchImpl });
    const result = await discovery.discoverRestModels({
      provider: {
        kind: "rest",
        protocol: "anthropic",
        endpoint: "https://api.anthropic.com",
      },
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.available).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.logSafe)).not.toContain("sk-");
  });

  it("caps remote model count and name length and never sends a user prompt", async () => {
    const models = Array.from({ length: 100 }, (_, index) => ({
      id: index === 0 ? "gpt-4o" : `gpt-extra-${"n".repeat(200)}-${index}`,
    }));
    models[1] = { id: "gpt-ok" };
    const fetchImpl = vi.fn(async (url: string, init: { method: string; body?: string }) => {
      expect(url).toContain("/v1/models");
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: models });
        },
      };
    });
    const discovery = createNiaModelDiscovery({ fetchImpl });
    const result = await discovery.discoverRestModels({
      provider: {
        kind: "rest",
        protocol: "openai",
        endpoint: "https://api.openai.com",
      },
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(result.models.length).toBeLessThanOrEqual(NIA_MODEL_DISCOVERY_LIMITS.maxModels);
    expect(result.models.every((name: string) => name.length <= NIA_MODEL_DISCOVERY_LIMITS.maxNameLength)).toBe(
      true,
    );
    expect(result.models).toContain("gpt-4o");
    expect(result.models).toContain("gpt-ok");
    expect(JSON.stringify(result.logSafe)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  });

  it("tests REST and CLI connections with typed availability", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ data: [{ id: "gpt-4o" }] });
      },
    }));
    const discovery = createNiaModelDiscovery({
      fetchImpl,
      cliRegistry: {
        detectAdapter: (adapterId: string) => ({
          adapterId,
          available: adapterId === "claude",
          command: adapterId,
          path: adapterId === "claude" ? "/usr/bin/claude" : null,
          version: "1.0.0",
          generationOnly: true,
          toolModeDisable: true,
          agentic: false,
        }),
      },
    });

    await expect(
      discovery.testRestConnection({
        provider: { kind: "rest", protocol: "openai", endpoint: "https://api.openai.com" },
        apiKey: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
      }),
    ).resolves.toMatchObject({ available: true, status: "connected" });

    await expect(discovery.testCliConnection({ adapterId: "claude" })).resolves.toMatchObject({
      available: true,
      status: "connected",
    });
    await expect(discovery.testCliConnection({ adapterId: "gemini" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });

    const cli = await discovery.discoverCli({ adapterId: "claude" });
    expect(cli.detection.pathPresent).toBe(true);
    expect(cli.detection).not.toHaveProperty("path");
  });
});
