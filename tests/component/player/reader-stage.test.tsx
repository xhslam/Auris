import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderStage } from "@/components/player/reader-stage";
import type { SessionPlayback } from "@/features/sessions/session.types";

const startWavRecordingMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/assessment/wav-recorder", () => ({
  startWavRecording: startWavRecordingMock,
}));

const playback: SessionPlayback = {
  session: {
    id: "session-1",
    title: "Shadowing Demo",
    status: "ready",
    audioUrl: "/api/audio/session-1",
    durationMs: 2400,
    speedDefault: 1,
    voiceId: "alloy",
  },
  sentences: [
    {
      id: "sentence-1",
      sessionId: "session-1",
      orderIndex: 0,
      text: "Learning a language",
      startMs: 0,
      endMs: 1200,
    },
    {
      id: "sentence-2",
      sessionId: "session-1",
      orderIndex: 1,
      text: "builds speaking confidence",
      startMs: 1200,
      endMs: 2400,
    },
  ],
  wordTokens: [
    {
      id: "word-1",
      sentenceId: "sentence-1",
      orderIndex: 0,
      text: "Learning",
      startMs: 0,
      endMs: 400,
    },
    {
      id: "word-2",
      sentenceId: "sentence-1",
      orderIndex: 1,
      text: "a",
      startMs: 400,
      endMs: 520,
    },
    {
      id: "word-3",
      sentenceId: "sentence-1",
      orderIndex: 2,
      text: "language",
      startMs: 520,
      endMs: 1200,
    },
    {
      id: "word-4",
      sentenceId: "sentence-2",
      orderIndex: 0,
      text: "builds",
      startMs: 1200,
      endMs: 1650,
    },
    {
      id: "word-5",
      sentenceId: "sentence-2",
      orderIndex: 1,
      text: "speaking",
      startMs: 1650,
      endMs: 2050,
    },
    {
      id: "word-6",
      sentenceId: "sentence-2",
      orderIndex: 2,
      text: "confidence",
      startMs: 2050,
      endMs: 2400,
    },
  ],
};

describe("ReaderStage", () => {
  beforeEach(() => {
    startWavRecordingMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a ready state placeholder before playback is available", () => {
    render(
      <ReaderStage
        activeWordTokenId={null}
        playback={null}
      />,
    );

    expect(screen.getByText("口头演练")).toBeInTheDocument();
    expect(screen.queryByLabelText("英语语流波形")).not.toBeInTheDocument();
    expect(
      screen.getByText("生成训练音频后，这里会进入逐词跟读舞台。"),
    ).toBeInTheDocument();
  });

  it("highlights the active token for the current playback moment", () => {
    render(
      <ReaderStage
        activeWordTokenId="word-3"
        playback={playback}
      />,
    );

    const sentenceRegion = screen.getByLabelText("Learning a language");

    expect(within(sentenceRegion).getByRole("button", { name: "Learning" })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(within(sentenceRegion).getByRole("button", { name: "language" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByLabelText("builds speaking confidence"),
    ).toHaveAttribute("data-active-sentence", "false");
  });

  it("renders sentence cards with a replay action for each sentence", async () => {
    const user = userEvent.setup();
    const onReplaySentence = vi.fn();

    render(
      <ReaderStage
        activeWordTokenId={null}
        onReplaySentence={onReplaySentence}
        playback={playback}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重播句子 sentence-1" }));

    expect(onReplaySentence).toHaveBeenCalledWith(0);
  });

  it("looks up a clicked word and saves it with sentence context", async () => {
    const user = userEvent.setup();
    const onSaveWord = vi.fn();
    const onSeekToWord = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          entry: {
            meanings: [
              {
                definitions: ["a system of words used for communication"],
                lexicalCategory: "noun",
              },
            ],
            pronunciations: ["/ˈlæŋɡwɪdʒ/"],
            sourceLabel: "WordNet Offline",
            synonyms: ["speech"],
            word: "language",
          },
        }),
        ok: true,
      })),
    );

    render(
      <ReaderStage
        activeWordTokenId={null}
        onSaveWord={onSaveWord}
        onSeekToWord={onSeekToWord}
        playback={playback}
      />,
    );

    await user.click(screen.getByRole("button", { name: "language" }));

    expect(onSeekToWord).toHaveBeenCalledWith(520);
    expect(await screen.findByText("a system of words used for communication")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "加入生词本" }));

    expect(onSaveWord).toHaveBeenCalledWith(
      expect.objectContaining({
        definitions: ["a system of words used for communication"],
        endMs: 1200,
        lexicalCategory: "noun",
        sentenceId: "sentence-1",
        sourceId: "session-1",
        sourceLabel: "Shadowing Demo",
        sourceSentence: "Learning a language",
        sourceType: "session",
        startMs: 520,
        synonyms: ["speech"],
        word: "language",
      }),
    );
  });

  it("records a sentence and saves pronunciation assessment feedback", async () => {
    const user = userEvent.setup();
    const onSaveAssessment = vi.fn();
    const stop = vi.fn(async () => ({
      blob: new Blob(["fake wav"], { type: "audio/wav" }),
      durationMs: 1400,
      mimeType: "audio/wav",
    }));

    startWavRecordingMock.mockResolvedValue({
      cleanup: vi.fn(),
      startedAt: Date.now(),
      stop,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const formData = init?.body as FormData;

        expect(formData.get("referenceText")).toBe("Learning a language");
        expect(formData.get("sourceLabel")).toBe("Shadowing Demo");

        return {
          json: async () => ({
            assessment: {
              accuracyScore: 88,
              completenessScore: 91,
              createdAt: "2026-06-15T01:00:00.000Z",
              fluencyScore: 82,
              id: "assessment-1",
              locale: "en-US",
              overallScore: 86,
              referenceText: "Learning a language",
              sourceLabel: "Shadowing Demo",
              wordAssessments: [],
            },
          }),
          ok: true,
        };
      }),
    );

    render(
      <ReaderStage
        activeWordTokenId={null}
        onSaveAssessment={onSaveAssessment}
        playback={playback}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "录这句" })[0]);
    expect(await screen.findByText("正在录音")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "结束并评分" }));

    expect(stop).toHaveBeenCalled();
    expect(await screen.findByLabelText("句子评分 sentence-1")).toHaveTextContent("86");
    expect(onSaveAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        accuracyScore: 88,
        endMs: 1200,
        fluencyScore: 82,
        overallScore: 86,
        sentenceId: "sentence-1",
        sourceId: "session-1",
        sourceLabel: "Shadowing Demo",
        startMs: 0,
      }),
    );
  });

  it("keeps the rehearsal stage free of tone visualization panels", () => {
    render(
      <ReaderStage
        activeWordTokenId={null}
        playback={playback}
      />,
    );

    expect(screen.queryByLabelText("英语语流波形")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我的录音对照" })).not.toBeInTheDocument();
  });
});
