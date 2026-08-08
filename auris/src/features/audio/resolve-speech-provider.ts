import {
  getVoiceProfileById,
  resolveVoiceProfileId,
} from "@/features/audio/voice-profile-options";
import { OpenAISpeechProvider } from "@/features/audio/openai-speech-provider";
import type { SpeechProvider } from "@/features/audio/speech-provider";
import { VoxCPMSpeechProvider } from "@/features/audio/voxcpm-speech-provider";
import type { SpeechEnginePreference } from "@/features/settings/training-settings-store";
import { getOptionalVoiceEngineEnv } from "@/lib/server-env";

type ResolveSpeechProviderInput = {
  speechEnginePreference?: SpeechEnginePreference;
  voiceId?: string;
  voiceProfileId?: string;
};

type ResolveSpeechProviderDependencies = {
  createOpenAIProvider?: () => SpeechProvider;
  createVoxCPMProvider?: () => SpeechProvider;
  hasLocalVoiceEngine?: () => boolean;
};

export function hasLocalVoiceEngineConfigured() {
  return Boolean(getOptionalVoiceEngineEnv());
}

export function resolveSpeechProvider(
  input: ResolveSpeechProviderInput,
  dependencies: ResolveSpeechProviderDependencies = {},
) {
  const createOpenAIProvider =
    dependencies.createOpenAIProvider ?? (() => new OpenAISpeechProvider());
  const createVoxCPMProvider =
    dependencies.createVoxCPMProvider ?? (() => new VoxCPMSpeechProvider());
  const hasLocalVoiceEngine =
    dependencies.hasLocalVoiceEngine ?? hasLocalVoiceEngineConfigured;
  const voiceProfileId = resolveVoiceProfileId(
    input.voiceProfileId,
    input.voiceId === "male" ? "male" : input.voiceId === "female" ? "female" : null,
  );
  const voiceProfile = getVoiceProfileById(voiceProfileId);
  const speechEnginePreference = input.speechEnginePreference ?? "auto_local_first";
  const canUseLocalVoiceEngine = hasLocalVoiceEngine();

  if (speechEnginePreference === "local_only") {
    if (!canUseLocalVoiceEngine) {
      throw new Error("LOCAL_VOICE_ENGINE_UNAVAILABLE");
    }

    return {
      provider: createVoxCPMProvider(),
      voiceProfileId,
    };
  }

  if (voiceProfile?.provider === "voxcpm") {
    return {
      provider: canUseLocalVoiceEngine
        ? createVoxCPMProvider()
        : createOpenAIProvider(),
      voiceProfileId,
    };
  }

  return {
    provider: createOpenAIProvider(),
    voiceProfileId,
  };
}
