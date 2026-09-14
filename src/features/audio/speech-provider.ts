import type { SpeechEnginePreference } from "@/features/settings/training-settings-store";

export type TranscriptWord = {
  word: string;
  startMs: number;
  endMs: number;
};

export type PreparedSpeechResult = {
  audioBuffer: Buffer | null;
  contentType: string | null;
  durationMs: number;
  transcriptWords: TranscriptWord[];
};

export type PrepareShadowingAudioInput = {
  sessionId: string;
  speechEnginePreference?: SpeechEnginePreference;
  text: string;
  voiceId?: string;
  voiceProfileId?: string;
};

export interface SpeechProvider {
  prepareShadowingAudio(input: PrepareShadowingAudioInput): Promise<PreparedSpeechResult>;
}
