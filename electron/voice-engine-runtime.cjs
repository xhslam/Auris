"use strict";

function createStatus({
  activeProvider,
  modelVersion = null,
  platform,
  reason = null,
  state,
}) {
  return {
    activeProvider,
    modelVersion,
    platform,
    reason,
    state,
  };
}

function createVoiceEngineRuntime({
  env = process.env,
  fetchImpl = globalThis.fetch,
  platform = process.platform,
} = {}) {
  const runtimeUrl =
    typeof env.SHADOWING_VOXCPM_URL === "string" && env.SHADOWING_VOXCPM_URL.trim()
      ? env.SHADOWING_VOXCPM_URL.trim().replace(/\/+$/, "")
      : null;
  const modelVersion =
    typeof env.SHADOWING_VOXCPM_MODEL_VERSION === "string" &&
    env.SHADOWING_VOXCPM_MODEL_VERSION.trim()
      ? env.SHADOWING_VOXCPM_MODEL_VERSION.trim()
      : null;

  let status = runtimeUrl
    ? createStatus({
        activeProvider: "voxcpm",
        modelVersion,
        platform,
        state: "starting",
      })
    : createStatus({
        activeProvider: "openai",
        modelVersion,
        platform,
        reason: "missing_runtime_url",
        state: "not_configured",
      });

  async function getStatus() {
    return status;
  }

  async function getCapabilities() {
    return {
      locales: ["en-US"],
      modes: ["preset", "designed", "reference_clone"],
      supportsReferenceAudio: true,
      supportsStylePrompt: true,
    };
  }

  async function start() {
    if (!runtimeUrl) {
      status = createStatus({
        activeProvider: "openai",
        modelVersion,
        platform,
        reason: "missing_runtime_url",
        state: "not_configured",
      });
      return status;
    }

    status = createStatus({
      activeProvider: "voxcpm",
      modelVersion,
      platform,
      state: "ready",
    });
    return status;
  }

  async function stop() {
    status = createStatus({
      activeProvider: "openai",
      modelVersion,
      platform,
      reason: "manual_stop",
      state: "degraded",
    });
    return status;
  }

  async function generate(input) {
    if (!runtimeUrl || typeof fetchImpl !== "function") {
      throw new Error("VOICE_ENGINE_UNAVAILABLE");
    }

    status = createStatus({
      activeProvider: "voxcpm",
      modelVersion,
      platform,
      state: "busy",
    });

    try {
      const response = await fetchImpl(`${runtimeUrl}/generate`, {
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`VOICE_ENGINE_HTTP_${response.status}`);
      }

      const payload = await response.json();
      status = createStatus({
        activeProvider: "voxcpm",
        modelVersion,
        platform,
        state: "ready",
      });
      return payload;
    } catch (error) {
      status = createStatus({
        activeProvider: "openai",
        modelVersion,
        platform,
        reason: error instanceof Error ? error.message : "generation_failed",
        state: "degraded",
      });
      throw error;
    }
  }

  return {
    generate,
    getCapabilities,
    getStatus,
    start,
    stop,
  };
}

module.exports = {
  createVoiceEngineRuntime,
};
