import { afterEach, describe, expect, it, vi } from "vitest";

type TranscriptWord = {
  endMs: number;
  startMs: number;
  word: string;
};

async function loadPrepareSessionSubject(options?: {
  mappedTokens?: Array<{
    endMs: number;
    startMs: number;
    text: string;
  }>;
  preparedSpeech?: {
    audioBuffer: Buffer | null;
    contentType: string | null;
    durationMs: number;
    transcriptWords: TranscriptWord[];
  };
  resolvedVoiceProfileId?: string;
  storedAudioUrl?: string;
}) {
  vi.resetModules();

  const preparedSpeech =
    options?.preparedSpeech ?? {
      audioBuffer: Buffer.from("fake-mp3"),
      contentType: "audio/mpeg",
      durationMs: 960,
      transcriptWords: [
        {
          endMs: 420,
          startMs: 0,
          word: "Shadowing",
        },
        {
          endMs: 960,
          startMs: 420,
          word: "builds",
        },
      ],
    };
  const mappedTokens =
    options?.mappedTokens ?? [
      {
        endMs: 420,
        startMs: 0,
        text: "Shadowing",
      },
      {
        endMs: 960,
        startMs: 420,
        text: "builds.",
      },
    ];
  const resolvedVoiceProfileId = options?.resolvedVoiceProfileId ?? "openai-female";
  const storedAudioUrl = options?.storedAudioUrl ?? "/api/audio/session-42";

  const resolveSpeechProviderMock = vi.fn(() => ({
    provider: {
      prepareShadowingAudio: vi.fn(async () => preparedSpeech),
    },
    voiceProfileId: resolvedVoiceProfileId,
  }));
  const mapWordTimestampsMock = vi.fn(() => mappedTokens);
  const storeAudioAssetMock = vi.fn(async () => storedAudioUrl);
  const savePreparedSessionArtifactsMock = vi.fn(
    async ({
      audioUrl,
      durationMs,
      sessionId,
      status,
      voiceId,
    }: {
      audioUrl: string | null;
      durationMs: number;
      sessionId: string;
      status: string;
      voiceId: string;
    }) => ({
      audioUrl,
      createdAt: "2026-04-21T00:00:00.000Z",
      durationMs,
      id: sessionId,
      normalizedText: "",
      originalText: "",
      sourceType: "paste",
      speedDefault: 1,
      status,
      title: "Prepared session",
      updatedAt: "2026-04-21T00:00:00.000Z",
      userId: "user-1",
      voiceId,
    }),
  );

  vi.doMock("@/features/audio/resolve-speech-provider", () => ({
    resolveSpeechProvider: resolveSpeechProviderMock,
  }));
  vi.doMock("@/features/audio/map-word-timestamps", () => ({
    mapWordTimestamps: mapWordTimestampsMock,
  }));
  vi.doMock("@/features/storage/audio-storage", () => ({
    storeAudioAsset: storeAudioAssetMock,
  }));
  vi.doMock("@/server/repositories/session-repository", () => ({
    savePreparedSessionArtifacts: savePreparedSessionArtifactsMock,
  }));

  const prepareSessionModule = await import("@/features/sessions/prepare-session");

  return {
    mapWordTimestampsMock,
    prepareSessionPlayback: prepareSessionModule.prepareSessionPlayback,
    resolveSpeechProviderMock,
    savePreparedSessionArtifactsMock,
    storeAudioAssetMock,
  };
}

describe("prepareSessionPlayback branch coverage", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("stores generated audio and persists mapped sentence timing artifacts", async () => {
    const {
      prepareSessionPlayback,
      resolveSpeechProviderMock,
      savePreparedSessionArtifactsMock,
      storeAudioAssetMock,
    } = await loadPrepareSessionSubject();

    const result = await prepareSessionPlayback({
      sessionId: "session-42",
      speechEnginePreference: "cloud_only",
      text: "Shadowing builds.",
      voiceId: "female",
      voiceProfileId: "openai-female",
    });

    expect(resolveSpeechProviderMock).toHaveBeenCalledWith({
      speechEnginePreference: "cloud_only",
      voiceId: "female",
      voiceProfileId: "openai-female",
    });
    expect(storeAudioAssetMock).toHaveBeenCalledWith({
      audioBuffer: Buffer.from("fake-mp3"),
      contentType: "audio/mpeg",
      sessionId: "session-42",
    });
    expect(savePreparedSessionArtifactsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: "/api/audio/session-42",
        durationMs: 960,
        sentences: [
          expect.objectContaining({
            endMs: 960,
            orderIndex: 0,
            sessionId: "session-42",
            startMs: 0,
            text: "Shadowing builds.",
          }),
        ],
        status: "ready",
        voiceId: "openai-female",
        wordTokens: [
          expect.objectContaining({
            endMs: 420,
            orderIndex: 0,
            startMs: 0,
            text: "Shadowing",
          }),
          expect.objectContaining({
            endMs: 960,
            orderIndex: 1,
            startMs: 420,
            text: "builds.",
          }),
        ],
      }),
    );
    expect(result.audioUrl).toBe("/api/audio/session-42");
    expect(result.sentences).toHaveLength(1);
    expect(result.wordTokens).toHaveLength(2);
  });

  it("skips audio storage and falls back to zero sentence timing when mapped tokens are missing", async () => {
    const {
      mapWordTimestampsMock,
      prepareSessionPlayback,
      savePreparedSessionArtifactsMock,
      storeAudioAssetMock,
    } = await loadPrepareSessionSubject({
      mappedTokens: [],
      preparedSpeech: {
        audioBuffer: null,
        contentType: null,
        durationMs: 0,
        transcriptWords: [
          {
            endMs: 300,
            startMs: 0,
            word: "Shadowing",
          },
        ],
      },
      resolvedVoiceProfileId: "openai-male",
    });

    const result = await prepareSessionPlayback({
      sessionId: "session-43",
      text: "Shadowing builds.",
      voiceId: "male",
      voiceProfileId: "openai-male",
    });

    expect(mapWordTimestampsMock).toHaveBeenCalledTimes(1);
    expect(storeAudioAssetMock).not.toHaveBeenCalled();
    expect(savePreparedSessionArtifactsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: null,
        durationMs: 0,
        sentences: [
          expect.objectContaining({
            endMs: 0,
            startMs: 0,
            text: "Shadowing builds.",
          }),
        ],
        voiceId: "openai-male",
        wordTokens: [],
      }),
    );
    expect(result.audioUrl).toBeNull();
    expect(result.sentences).toEqual([
      expect.objectContaining({
        endMs: 0,
        startMs: 0,
        text: "Shadowing builds.",
      }),
    ]);
    expect(result.wordTokens).toEqual([]);
  });
});
