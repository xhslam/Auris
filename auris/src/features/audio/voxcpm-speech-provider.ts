import {
  getVoiceProfileById,
  resolveVoiceProfileId,
} from "@/features/audio/voice-profile-options";
import type {
  PrepareShadowingAudioInput,
  PreparedSpeechResult,
  SpeechProvider,
} from "@/features/audio/speech-provider";
import { getOptionalVoiceEngineEnv } from "@/lib/server-env";

type VoxCPMGenerateResponse = {
  audioBase64: string;
  contentType: string;
  durationMs: number;
  transcriptWords?: Array<{
    endMs: number;
    startMs: number;
    word: string;
  }>;
};

export class VoxCPMSpeechProvider implements SpeechProvider {
  async prepareShadowingAudio(
    input: PrepareShadowingAudioInput,
  ): Promise<PreparedSpeechResult> {
    const env = getOptionalVoiceEngineEnv();

    if (!env) {
      throw new Error("LOCAL_VOICE_ENGINE_UNAVAILABLE");
    }

    const voiceProfileId = resolveVoiceProfileId(
      input.voiceProfileId,
      input.voiceId === "male" ? "male" : input.voiceId === "female" ? "female" : null,
    );
    const voiceProfile = getVoiceProfileById(voiceProfileId);

    const response = await fetch(`${env.SHADOWING_VOXCPM_URL.replace(/\/+$/, "")}/generate`, {
      body: JSON.stringify({
        locale: voiceProfile?.locale ?? "en-US",
        sessionId: input.sessionId,
        stylePrompt: voiceProfile?.stylePrompt ?? null,
        text: input.text,
        voiceProfileId,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`VOICE_ENGINE_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as VoxCPMGenerateResponse;

    return {
      audioBuffer: Buffer.from(payload.audioBase64, "base64"),
      contentType: payload.contentType,
      durationMs: payload.durationMs,
      transcriptWords: payload.transcriptWords ?? [],
    };
  }
}
