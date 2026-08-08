import {
  getVoiceProfileById,
  LEGACY_VOICE_PROFILE_ID_MAP,
  listVoiceProfiles,
} from "@/features/audio/voice-profile-options";
import type { GeneratedVoiceId } from "@/features/settings/training-settings-store";

export const GENERATED_VOICE_OPTIONS: Array<{
  id: GeneratedVoiceId;
  label: string;
  providerVoiceId: string;
}> = listVoiceProfiles()
  .filter((profile) => profile.legacyGeneratedVoiceId && profile.providerVoiceId)
  .map((profile) => ({
    id: profile.legacyGeneratedVoiceId as GeneratedVoiceId,
    label: profile.label,
    providerVoiceId: profile.providerVoiceId as string,
  }));

export function resolveProviderVoiceId(voiceId: GeneratedVoiceId) {
  const voiceProfileId = LEGACY_VOICE_PROFILE_ID_MAP[voiceId];

  return (
    getVoiceProfileById(voiceProfileId)?.providerVoiceId ??
    GENERATED_VOICE_OPTIONS[0].providerVoiceId
  );
}
