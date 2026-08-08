import OpenAI from "openai";
import { synthesizeWithWindowsTts } from "@/features/audio/local-windows-tts";
import {
  getVoiceProfileById,
  resolveVoiceProfileId,
} from "@/features/audio/voice-profile-options";
import { resolveProviderVoiceId } from "@/features/audio/voice-options";
import { getOptionalOpenAIEnv } from "@/lib/server-env";
import type {
  PrepareShadowingAudioInput,
  PreparedSpeechResult,
  SpeechProvider,
  TranscriptWord,
} from "@/features/audio/speech-provider";

function createSyntheticTranscript(text: string): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  let cursor = 0;

  return words.map((word) => {
    const duration = Math.max(120, word.replace(/[^\p{L}\p{N}]/gu, "").length * 70);
    const item = {
      word,
      startMs: cursor,
      endMs: cursor + duration,
    };
    cursor += duration + 40;
    return item;
  });
}

async function prepareWithFallback(
  input: { text: string; voiceId: string },
): Promise<PreparedSpeechResult> {
  const transcriptWords = createSyntheticTranscript(input.text);
  const durationMs = transcriptWords.at(-1)?.endMs ?? 0;
  const localAudio = await synthesizeWithWindowsTts({
    text: input.text,
    voiceId: input.voiceId,
  });

  return {
    audioBuffer: localAudio?.audioBuffer ?? null,
    contentType: localAudio?.contentType ?? null,
    durationMs,
    transcriptWords,
  };
}

function resolvePreparedVoiceId(input: {
  voiceId?: string;
  voiceProfileId?: string;
}) {
  const legacyVoiceId =
    input.voiceId === "male" ? "male" : input.voiceId === "female" ? "female" : null;
  const resolvedVoiceProfileId = resolveVoiceProfileId(
    input.voiceProfileId,
    legacyVoiceId,
  );

  return (
    getVoiceProfileById(resolvedVoiceProfileId)?.providerVoiceId ??
    resolveProviderVoiceId(legacyVoiceId ?? "female")
  );
}

async function prepareWithOpenAI(input: {
  text: string;
  voiceId?: string;
  voiceProfileId?: string;
}): Promise<PreparedSpeechResult> {
  const providerVoiceId = resolvePreparedVoiceId(input);
  const env = getOptionalOpenAIEnv();

  if (!env) {
    return prepareWithFallback({
      text: input.text,
      voiceId: providerVoiceId,
    });
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  try {
    const speechResponse = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: providerVoiceId as "alloy",
      input: input.text,
      response_format: "mp3",
    });

    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const transcription = await client.audio.transcriptions.create({
      file: new File([audioBuffer], "shadowing.mp3", { type: "audio/mpeg" }),
      model: "gpt-4o-mini-transcribe",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const transcriptWords =
      transcription.words?.map((word) => ({
        word: word.word,
        startMs: Math.round(word.start * 1000),
        endMs: Math.round(word.end * 1000),
      })) ?? [];

    if (transcriptWords.length === 0) {
      return prepareWithFallback({
        ...input,
        voiceId: providerVoiceId,
      });
    }

    return {
      audioBuffer,
      contentType: "audio/mpeg",
      durationMs: transcriptWords.at(-1)?.endMs ?? 0,
      transcriptWords,
    };
  } catch {
    return prepareWithFallback({
      ...input,
      voiceId: providerVoiceId,
    });
  }
}

export class OpenAISpeechProvider implements SpeechProvider {
  async prepareShadowingAudio(input: PrepareShadowingAudioInput) {
    void input.sessionId;

    return prepareWithOpenAI({
      text: input.text,
      voiceId: input.voiceId,
      voiceProfileId: input.voiceProfileId,
    });
  }
}
