import { describe, expect, it, vi } from "vitest";
import {
  __setWindowsTtsSynthesizerForTests,
} from "@/features/audio/local-windows-tts";

const openAiConstructorMock = vi.fn();
const openAiSpeechCreateMock = vi.fn();
const openAiTranscriptionsCreateMock = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    audio = {
      speech: {
        create: openAiSpeechCreateMock,
      },
      transcriptions: {
        create: openAiTranscriptionsCreateMock,
      },
    };

    constructor(config: { apiKey: string }) {
      openAiConstructorMock(config);
    }
  },
}));

import { OpenAISpeechProvider } from "@/features/audio/openai-speech-provider";

describe("OpenAISpeechProvider", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    __setWindowsTtsSynthesizerForTests(null);
    openAiConstructorMock.mockReset();
    openAiSpeechCreateMock.mockReset();
    openAiTranscriptionsCreateMock.mockReset();

    if (typeof originalOpenAiApiKey === "string") {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
      return;
    }

    delete process.env.OPENAI_API_KEY;
  });

  it("falls back to a resolved provider voice when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    let capturedInput: { text: string; voiceId: string } | null = null;
    __setWindowsTtsSynthesizerForTests(async (input) => {
      capturedInput = input;
      return Buffer.from("fake-wav");
    });

    const provider = new OpenAISpeechProvider();
    const result = await provider.prepareShadowingAudio({
      sessionId: "session-1",
      text: "Shadowing improves rhythm and stress.",
      voiceProfileId: "openai-male",
    });

    expect(capturedInput).toEqual({
      text: "Shadowing improves rhythm and stress.",
      voiceId: "ash",
    });
    expect(result.audioBuffer).toEqual(Buffer.from("fake-wav"));
    expect(result.contentType).toBe("audio/wav");
    expect(result.transcriptWords.length).toBeGreaterThan(0);
  });

  it("defaults to the female provider voice and zero duration for empty local fallback input", async () => {
    delete process.env.OPENAI_API_KEY;

    let capturedInput: { text: string; voiceId: string } | null = null;
    __setWindowsTtsSynthesizerForTests(async (input) => {
      capturedInput = input;
      return Buffer.from("fake-wav");
    });

    const provider = new OpenAISpeechProvider();
    const result = await provider.prepareShadowingAudio({
      sessionId: "session-empty",
      text: "",
    });

    expect(capturedInput).toEqual({
      text: "",
      voiceId: "alloy",
    });
    expect(result.durationMs).toBe(0);
    expect(result.transcriptWords).toEqual([]);
  });

  it("returns OpenAI audio and transcript timings when the cloud flow succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";

    const fallbackSynthesizer = vi.fn(async () => Buffer.from("fake-wav"));
    __setWindowsTtsSynthesizerForTests(fallbackSynthesizer);
    openAiSpeechCreateMock.mockResolvedValue({
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    });
    openAiTranscriptionsCreateMock.mockResolvedValue({
      words: [
        {
          end: 0.42,
          start: 0,
          word: "Shadowing",
        },
        {
          end: 0.91,
          start: 0.42,
          word: "builds",
        },
      ],
    });

    const provider = new OpenAISpeechProvider();
    const result = await provider.prepareShadowingAudio({
      sessionId: "session-2",
      text: "Shadowing builds",
      voiceId: "female",
      voiceProfileId: "voxcpm-teacher-female",
    });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
    });
    expect(openAiSpeechCreateMock).toHaveBeenCalledWith({
      input: "Shadowing builds",
      model: "gpt-4o-mini-tts",
      response_format: "mp3",
      voice: "alloy",
    });
    expect(openAiTranscriptionsCreateMock).toHaveBeenCalledTimes(1);
    expect(fallbackSynthesizer).not.toHaveBeenCalled();
    expect(result).toEqual({
      audioBuffer: Buffer.from([1, 2, 3, 4]),
      contentType: "audio/mpeg",
      durationMs: 910,
      transcriptWords: [
        {
          endMs: 420,
          startMs: 0,
          word: "Shadowing",
        },
        {
          endMs: 910,
          startMs: 420,
          word: "builds",
        },
      ],
    });
  });

  it("falls back to local synthesis when OpenAI transcription returns no words", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";

    let capturedInput: { text: string; voiceId: string } | null = null;
    __setWindowsTtsSynthesizerForTests(async (input) => {
      capturedInput = input;
      return Buffer.from("fallback-wav");
    });
    openAiSpeechCreateMock.mockResolvedValue({
      arrayBuffer: async () => Uint8Array.from([8, 9, 10]).buffer,
    });
    openAiTranscriptionsCreateMock.mockResolvedValue({});

    const provider = new OpenAISpeechProvider();
    const result = await provider.prepareShadowingAudio({
      sessionId: "session-3",
      text: "Practice every day",
      voiceProfileId: "openai-male",
    });

    expect(openAiSpeechCreateMock).toHaveBeenCalledTimes(1);
    expect(openAiTranscriptionsCreateMock).toHaveBeenCalledTimes(1);
    expect(capturedInput).toEqual({
      text: "Practice every day",
      voiceId: "ash",
    });
    expect(result.audioBuffer).toEqual(Buffer.from("fallback-wav"));
    expect(result.contentType).toBe("audio/wav");
    expect(result.transcriptWords.length).toBeGreaterThan(0);
  });

  it("falls back to local synthesis when the OpenAI request throws", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";

    let capturedInput: { text: string; voiceId: string } | null = null;
    __setWindowsTtsSynthesizerForTests(async (input) => {
      capturedInput = input;
      return Buffer.from("fallback-wav");
    });
    openAiSpeechCreateMock.mockRejectedValue(new Error("network failure"));

    const provider = new OpenAISpeechProvider();
    const result = await provider.prepareShadowingAudio({
      sessionId: "session-4",
      text: "Stay close to the rhythm",
      voiceId: "female",
    });

    expect(openAiSpeechCreateMock).toHaveBeenCalledTimes(1);
    expect(openAiTranscriptionsCreateMock).not.toHaveBeenCalled();
    expect(capturedInput).toEqual({
      text: "Stay close to the rhythm",
      voiceId: "alloy",
    });
    expect(result.audioBuffer).toEqual(Buffer.from("fallback-wav"));
    expect(result.contentType).toBe("audio/wav");
    expect(result.transcriptWords.length).toBeGreaterThan(0);
  });
});
