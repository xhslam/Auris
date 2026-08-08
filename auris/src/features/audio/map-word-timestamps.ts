type TranscriptWord = {
  word: string;
  startMs: number;
  endMs: number;
};

type MapWordTimestampsInput = {
  tokens: string[];
  transcriptWords: TranscriptWord[];
};

function normalizeToken(token: string) {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
}

export function mapWordTimestamps(input: MapWordTimestampsInput) {
  const mapped = input.tokens.map((token, index) => {
    const transcriptWord = input.transcriptWords[index];

    if (!transcriptWord) {
      throw new Error("ALIGNMENT_FAILED");
    }

    if (normalizeToken(token) !== normalizeToken(transcriptWord.word)) {
      throw new Error("ALIGNMENT_FAILED");
    }

    return {
      text: token,
      startMs: transcriptWord.startMs,
      endMs: transcriptWord.endMs,
    };
  });

  return mapped;
}
