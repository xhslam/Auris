import { randomUUID } from "crypto";
import { mapWordTimestamps } from "@/features/audio/map-word-timestamps";
import { resolveSpeechProvider } from "@/features/audio/resolve-speech-provider";
import { storeAudioAsset } from "@/features/storage/audio-storage";
import type {
  SentenceRecord,
  WordTokenRecord,
} from "@/features/sessions/session.types";
import type { SpeechEnginePreference } from "@/features/settings/training-settings-store";
import { splitIntoSentences } from "@/features/text/sentence-segmentation";
import { tokenizeSentence } from "@/features/text/tokenize-sentence";
import { savePreparedSessionArtifacts } from "@/server/repositories/session-repository";

type PrepareSessionPlaybackInput = {
  sessionId: string;
  speechEnginePreference?: SpeechEnginePreference;
  text: string;
  voiceId?: string;
  voiceProfileId?: string;
};

export async function prepareSessionPlayback(
  input: PrepareSessionPlaybackInput,
) {
  const resolved = resolveSpeechProvider({
    speechEnginePreference: input.speechEnginePreference,
    voiceId: input.voiceId,
    voiceProfileId: input.voiceProfileId,
  });
  const preparedSpeech = await resolved.provider.prepareShadowingAudio({
    sessionId: input.sessionId,
    speechEnginePreference: input.speechEnginePreference,
    text: input.text,
    voiceId: input.voiceId,
    voiceProfileId: resolved.voiceProfileId,
  });

  const sentences = splitIntoSentences(input.text);
  const allTokens = sentences.flatMap((sentence) => tokenizeSentence(sentence));
  const mappedTokens = mapWordTimestamps({
    tokens: allTokens,
    transcriptWords: preparedSpeech.transcriptWords,
  });

  let tokenOffset = 0;
  const sentenceRecords: SentenceRecord[] = [];
  const wordTokenRecords: WordTokenRecord[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    const sentenceTokens = tokenizeSentence(sentence);
    const mappedSentenceTokens = mappedTokens.slice(
      tokenOffset,
      tokenOffset + sentenceTokens.length,
    );
    const sentenceId = randomUUID();

    sentenceRecords.push({
      id: sentenceId,
      sessionId: input.sessionId,
      orderIndex: sentenceIndex,
      text: sentence,
      startMs: mappedSentenceTokens[0]?.startMs ?? 0,
      endMs: mappedSentenceTokens.at(-1)?.endMs ?? 0,
    });

    mappedSentenceTokens.forEach((token, tokenIndex) => {
      wordTokenRecords.push({
        id: randomUUID(),
        sentenceId,
        orderIndex: tokenIndex,
        text: token.text,
        startMs: token.startMs,
        endMs: token.endMs,
      });
    });

    tokenOffset += sentenceTokens.length;
  });

  const audioUrl =
    preparedSpeech.audioBuffer && preparedSpeech.contentType
      ? await storeAudioAsset({
          sessionId: input.sessionId,
          audioBuffer: preparedSpeech.audioBuffer,
          contentType: preparedSpeech.contentType,
        })
      : null;

  const session = await savePreparedSessionArtifacts({
    sessionId: input.sessionId,
    status: "ready",
    audioUrl,
    durationMs: preparedSpeech.durationMs,
    voiceId: resolved.voiceProfileId,
    sentences: sentenceRecords,
    wordTokens: wordTokenRecords,
  });

  return {
    ...session,
    sentences: sentenceRecords,
    wordTokens: wordTokenRecords,
  };
}
