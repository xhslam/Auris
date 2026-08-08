export type LegacyGeneratedVoiceId = "female" | "male";

export type VoiceProfileProvider = "openai" | "voxcpm";
export type VoiceProfileMode = "preset" | "designed" | "reference_clone";
export type VoiceProfileId =
  | "openai-female"
  | "openai-male"
  | "voxcpm-teacher-female"
  | "voxcpm-teacher-male";

export type VoiceProfile = {
  id: VoiceProfileId;
  label: string;
  provider: VoiceProfileProvider;
  mode: VoiceProfileMode;
  locale: string;
  providerVoiceId?: string;
  stylePrompt?: string;
  legacyGeneratedVoiceId?: LegacyGeneratedVoiceId;
};

export const DEFAULT_VOICE_PROFILE_ID: VoiceProfileId = "openai-female";

export const LEGACY_VOICE_PROFILE_ID_MAP: Record<LegacyGeneratedVoiceId, VoiceProfileId> = {
  female: "openai-female",
  male: "openai-male",
};

const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: "openai-female",
    label: "女声",
    provider: "openai",
    mode: "preset",
    locale: "en-US",
    providerVoiceId: "alloy",
    legacyGeneratedVoiceId: "female",
  },
  {
    id: "openai-male",
    label: "男声",
    provider: "openai",
    mode: "preset",
    locale: "en-US",
    providerVoiceId: "ash",
    legacyGeneratedVoiceId: "male",
  },
  {
    id: "voxcpm-teacher-female",
    label: "VoxCPM 女老师",
    provider: "voxcpm",
    mode: "preset",
    locale: "en-US",
    stylePrompt: "Warm, clear, patient English teacher voice.",
  },
  {
    id: "voxcpm-teacher-male",
    label: "VoxCPM 男老师",
    provider: "voxcpm",
    mode: "preset",
    locale: "en-US",
    stylePrompt: "Calm, steady, clear English teacher voice.",
  },
];

export function listVoiceProfiles() {
  return VOICE_PROFILES.slice();
}

export function getVoiceProfileById(
  voiceProfileId: string | null | undefined,
): VoiceProfile | null {
  if (!voiceProfileId) {
    return null;
  }

  return VOICE_PROFILES.find((profile) => profile.id === voiceProfileId) ?? null;
}

export function resolveVoiceProfileId(
  voiceProfileId: string | null | undefined,
  legacyGeneratedVoiceId?: LegacyGeneratedVoiceId | null,
): VoiceProfileId {
  if (voiceProfileId && getVoiceProfileById(voiceProfileId)) {
    return voiceProfileId as VoiceProfileId;
  }

  if (
    voiceProfileId &&
    (voiceProfileId === "female" || voiceProfileId === "male")
  ) {
    return LEGACY_VOICE_PROFILE_ID_MAP[voiceProfileId];
  }

  if (legacyGeneratedVoiceId && legacyGeneratedVoiceId in LEGACY_VOICE_PROFILE_ID_MAP) {
    return LEGACY_VOICE_PROFILE_ID_MAP[legacyGeneratedVoiceId];
  }

  return DEFAULT_VOICE_PROFILE_ID;
}
