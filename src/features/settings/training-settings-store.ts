import {
  DEFAULT_TRAINING_SETTINGS,
  DEFAULT_VOICE_PROFILE_ID,
  type TrainingSettings,
  type GeneratedVoiceId,
  type SpeechEnginePreference,
  type VoiceProfileId,
  useTrainingSettingsStore,
} from '@/stores/app-store';

/**
 * @deprecated Use useTrainingSettingsStore from @/stores/app-store instead
 *
 * This file is kept for backward compatibility during migration.
 * All new code should import from @/stores/app-store.
 */

export {
  DEFAULT_TRAINING_SETTINGS,
  DEFAULT_VOICE_PROFILE_ID,
  useTrainingSettingsStore,
};
export type {
  TrainingSettings,
  GeneratedVoiceId,
  SpeechEnginePreference,
  VoiceProfileId,
};

import {
  resolveVoiceProfileId,
  type LegacyGeneratedVoiceId,
} from '@/features/audio/voice-profile-options';

export type { LegacyGeneratedVoiceId };

const STORAGE_KEY = 'english-shadowing-training-settings';
const ZUSTAND_STORAGE_KEY = 'training-settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractStoredSettings(value: unknown): Partial<TrainingSettings> | null {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.state) && isRecord(value.state.settings)) {
    return value.state.settings as Partial<TrainingSettings>;
  }

  return value as Partial<TrainingSettings>;
}

function normalizeTrainingSettings(
  value: Partial<TrainingSettings> | null,
): TrainingSettings {
  if (!value) {
    return DEFAULT_TRAINING_SETTINGS;
  }

  const generatedVoiceId =
    value.generatedVoiceId === 'male' ? 'male' : DEFAULT_TRAINING_SETTINGS.generatedVoiceId;
  const legacyGeneratedVoiceId =
    value.generatedVoiceId === 'male' || value.generatedVoiceId === 'female'
      ? (value.generatedVoiceId as LegacyGeneratedVoiceId)
      : undefined;
  const resolvedVoiceProfileId =
    typeof value.voiceProfileId === 'string'
      ? resolveVoiceProfileId(value.voiceProfileId, legacyGeneratedVoiceId)
      : legacyGeneratedVoiceId
        ? resolveVoiceProfileId(undefined, legacyGeneratedVoiceId)
        : DEFAULT_TRAINING_SETTINGS.voiceProfileId;

  return {
    autoSplitImportedText:
      typeof value.autoSplitImportedText === 'boolean'
        ? value.autoSplitImportedText
        : DEFAULT_TRAINING_SETTINGS.autoSplitImportedText,
    generatedVoiceId,
    ownVoiceRecordingId:
      typeof value.ownVoiceRecordingId === 'string' ? value.ownVoiceRecordingId : null,
    privacyMode:
      typeof value.privacyMode === 'boolean'
        ? value.privacyMode
        : DEFAULT_TRAINING_SETTINGS.privacyMode,
    repeatCount:
      typeof value.repeatCount === 'number' && Number.isFinite(value.repeatCount)
        ? value.repeatCount
        : DEFAULT_TRAINING_SETTINGS.repeatCount,
    repeatIntervalSec:
      typeof value.repeatIntervalSec === 'number' && Number.isFinite(value.repeatIntervalSec)
        ? value.repeatIntervalSec
        : DEFAULT_TRAINING_SETTINGS.repeatIntervalSec,
    speechEnginePreference:
      value.speechEnginePreference === 'local_only' ||
      value.speechEnginePreference === 'cloud_only' ||
      value.speechEnginePreference === 'auto_local_first'
        ? value.speechEnginePreference
        : DEFAULT_TRAINING_SETTINGS.speechEnginePreference,
    smartNotifications:
      typeof value.smartNotifications === 'boolean'
        ? value.smartNotifications
        : DEFAULT_TRAINING_SETTINGS.smartNotifications,
    useOwnVoiceReference:
      typeof value.useOwnVoiceReference === 'boolean'
        ? value.useOwnVoiceReference
        : DEFAULT_TRAINING_SETTINGS.useOwnVoiceReference,
    voiceProfileId: resolvedVoiceProfileId,
  };
}

/**
 * @deprecated Use useTrainingSettingsStore hook instead
 */
export function readTrainingSettings(storage: Storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(ZUSTAND_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_TRAINING_SETTINGS;
    }

    return normalizeTrainingSettings(extractStoredSettings(JSON.parse(raw)));
  } catch {
    return DEFAULT_TRAINING_SETTINGS;
  }
}

/**
 * @deprecated Use useTrainingSettingsStore hook instead
 */
export function writeTrainingSettings(
  storage: Storage,
  settings: Partial<TrainingSettings>,
) {
  const normalized = normalizeTrainingSettings(settings);

  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  storage.setItem(
    ZUSTAND_STORAGE_KEY,
    JSON.stringify({
      state: {
        settings: normalized,
      },
      version: 1,
    }),
  );
}
