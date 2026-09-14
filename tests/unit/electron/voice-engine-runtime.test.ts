import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createVoiceEngineRuntime,
} = require("../../../electron/voice-engine-runtime.cjs");

describe("voice-engine runtime", () => {
  it("reports not configured when no local runtime URL is available", async () => {
    const runtime = createVoiceEngineRuntime({
      env: {},
      platform: "win32",
    });

    await expect(runtime.getStatus()).resolves.toEqual(
      expect.objectContaining({
        activeProvider: "openai",
        platform: "win32",
        reason: "missing_runtime_url",
        state: "not_configured",
      }),
    );
  });

  it("reports capabilities for the desktop local-first voice engine", async () => {
    const runtime = createVoiceEngineRuntime({
      env: {
        SHADOWING_VOXCPM_URL: "http://127.0.0.1:7861",
      },
      platform: "win32",
    });

    await expect(runtime.getCapabilities()).resolves.toEqual({
      locales: ["en-US"],
      modes: ["preset", "designed", "reference_clone"],
      supportsReferenceAudio: true,
      supportsStylePrompt: true,
    });
  });

  it("degrades to cloud compatibility mode when stopped manually", async () => {
    const runtime = createVoiceEngineRuntime({
      env: {
        SHADOWING_VOXCPM_URL: "http://127.0.0.1:7861",
      },
      platform: "win32",
    });

    await runtime.start();

    await expect(runtime.stop()).resolves.toEqual(
      expect.objectContaining({
        activeProvider: "openai",
        reason: "manual_stop",
        state: "degraded",
      }),
    );
  });
});
