import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  getAiProviderById,
} = require("../../../electron/ai-provider-config.cjs");

describe("ai-provider-config", () => {
  it("defines all supported providers with persistent partitions", () => {
    expect(AI_PROVIDER_IDS).toEqual([
      "chatgpt",
      "gemini",
      "google",
      "deepseek",
    ]);
    expect(AI_PROVIDERS).toHaveLength(4);

    for (const provider of AI_PROVIDERS) {
      expect(provider.partition).toMatch(/^persist:shadowing-ai-/);
      expect(Array.isArray(provider.trustedOrigins)).toBe(true);
      expect(provider.url).toMatch(/^https:\/\//);
      expect(provider.id).toBeTruthy();
      expect(provider.label).toBeTruthy();
    }
  });

  it("returns null for unknown providers", () => {
    expect(getAiProviderById("missing-provider")).toBeNull();
  });
});
