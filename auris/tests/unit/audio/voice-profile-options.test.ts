import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_PROFILE_ID,
  LEGACY_VOICE_PROFILE_ID_MAP,
  getVoiceProfileById,
  listVoiceProfiles,
  resolveVoiceProfileId,
} from "@/features/audio/voice-profile-options";
import {
  DEFAULT_TRAINING_SETTINGS,
  readTrainingSettings,
} from "@/features/settings/training-settings-store";

describe("voice profile options", () => {
  it("exposes a default voice profile and a stable catalog", () => {
    expect(DEFAULT_VOICE_PROFILE_ID).toBe("openai-female");
    expect(listVoiceProfiles().map((profile) => profile.id)).toEqual(
      expect.arrayContaining(["openai-female", "openai-male", "voxcpm-teacher-female"]),
    );
    expect(getVoiceProfileById(DEFAULT_VOICE_PROFILE_ID)?.provider).toBe("openai");
  });

  it("maps legacy voice ids to provider-neutral voice profiles", () => {
    expect(LEGACY_VOICE_PROFILE_ID_MAP.female).toBe("openai-female");
    expect(LEGACY_VOICE_PROFILE_ID_MAP.male).toBe("openai-male");
    expect(resolveVoiceProfileId("female")).toBe("openai-female");
    expect(resolveVoiceProfileId("male")).toBe("openai-male");
  });

  it("sanitizes training settings with voice profile and engine preference defaults", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          generatedVoiceId: "male",
          speechEnginePreference: "auto_local_first",
          voiceProfileId: "voxcpm-teacher-female",
        }),
      setItem: () => undefined,
    } as Pick<Storage, "getItem" | "setItem"> as Storage;

    const settings = readTrainingSettings(storage);

    expect(settings).toEqual({
      ...DEFAULT_TRAINING_SETTINGS,
      generatedVoiceId: "male",
      speechEnginePreference: "auto_local_first",
      voiceProfileId: "voxcpm-teacher-female",
    });
  });
});
