import { describe, expect, it, vi } from "vitest";
import { resolveSpeechProvider } from "@/features/audio/resolve-speech-provider";
import type { SpeechProvider } from "@/features/audio/speech-provider";

function createProvider(name: string): SpeechProvider {
  return {
    prepareShadowingAudio: vi.fn(async () => ({
      audioBuffer: Buffer.from(name),
      contentType: "audio/wav",
      durationMs: 1000,
      transcriptWords: [],
    })),
  };
}

describe("resolveSpeechProvider", () => {
  it("uses the local VoxCPM provider for desktop local-first voice profiles when available", () => {
    const voxcpmProvider = createProvider("voxcpm");
    const openaiProvider = createProvider("openai");

    const resolved = resolveSpeechProvider(
      {
        speechEnginePreference: "auto_local_first",
        voiceProfileId: "voxcpm-teacher-female",
      },
      {
        createOpenAIProvider: () => openaiProvider,
        createVoxCPMProvider: () => voxcpmProvider,
        hasLocalVoiceEngine: () => true,
      },
    );

    expect(resolved.provider).toBe(voxcpmProvider);
    expect(resolved.voiceProfileId).toBe("voxcpm-teacher-female");
  });

  it("falls back to OpenAI when the local voice engine is unavailable", () => {
    const voxcpmProvider = createProvider("voxcpm");
    const openaiProvider = createProvider("openai");

    const resolved = resolveSpeechProvider(
      {
        speechEnginePreference: "auto_local_first",
        voiceProfileId: "voxcpm-teacher-female",
      },
      {
        createOpenAIProvider: () => openaiProvider,
        createVoxCPMProvider: () => voxcpmProvider,
        hasLocalVoiceEngine: () => false,
      },
    );

    expect(resolved.provider).toBe(openaiProvider);
    expect(resolved.voiceProfileId).toBe("voxcpm-teacher-female");
  });

  it("throws when local-only mode cannot use the local voice engine", () => {
    expect(() =>
      resolveSpeechProvider(
        {
          speechEnginePreference: "local_only",
          voiceProfileId: "voxcpm-teacher-female",
        },
        {
          createOpenAIProvider: () => createProvider("openai"),
          createVoxCPMProvider: () => createProvider("voxcpm"),
          hasLocalVoiceEngine: () => false,
        },
      ),
    ).toThrowError("LOCAL_VOICE_ENGINE_UNAVAILABLE");
  });
});
