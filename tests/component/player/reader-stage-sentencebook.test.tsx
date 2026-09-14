import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderStage } from "@/components/player/reader-stage";
import type { SessionPlayback } from "@/features/sessions/session.types";

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
  ],
};

describe("ReaderStage sentencebook actions", () => {
  it("lets the user save a sentence into the sentencebook", async () => {
    const user = userEvent.setup();
    const onSaveSentence = vi.fn();

    render(
      <ReaderStage
        activeWordTokenId={null}
        onSaveSentence={onSaveSentence}
        playback={playback}
      />,
    );

    await user.click(screen.getByRole("button", { name: "收藏句子 sentence-1" }));

    expect(onSaveSentence).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sentence-1",
        text: "Learning a language",
      }),
    );
  });
});
