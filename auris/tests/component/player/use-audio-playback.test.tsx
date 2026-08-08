import { render, waitFor } from "@testing-library/react";
import { useAudioPlayback } from "@/features/player/use-audio-playback";

type HarnessProps = {
  nonce: number;
};

function AudioPlaybackHarness({ nonce }: HarnessProps) {
  const speechFallback = {
    durationMs: 1800,
    tokens: [
      {
        endMs: 900,
        startMs: 0,
        text: `Learning-${nonce}`,
      },
    ],
  };

  const { audioRef } = useAudioPlayback({
    audioUrl: "/api/audio/session-1",
    speechFallback,
  });

  return <audio ref={audioRef} src="/api/audio/session-1" />;
}

describe("useAudioPlayback", () => {
  it("does not reload the audio element when timing metadata is recreated for the same audio url", async () => {
    const loadSpy = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    const pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});

    const { rerender } = render(<AudioPlaybackHarness nonce={1} />);

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    rerender(<AudioPlaybackHarness nonce={2} />);

    expect(loadSpy).toHaveBeenCalledTimes(1);

    loadSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it("replays the track after the configured repeat interval", async () => {
    vi.useFakeTimers();
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    function RepeatHarness() {
      const { audioRef, togglePlayback } = useAudioPlayback({
        audioUrl: "/api/audio/session-1",
        repeatCount: 1,
        repeatIntervalMs: 1200,
      });

      return (
        <>
          <button onClick={() => void togglePlayback()} type="button">
            play
          </button>
          <audio ref={audioRef} src="/api/audio/session-1" />
        </>
      );
    }

    const { container, getByRole } = render(<RepeatHarness />);
    const audio = container.querySelector("audio");

    if (!audio) {
      throw new Error("Expected audio element to exist");
    }

    getByRole("button", { name: "play" }).click();
    audio.dispatchEvent(new Event("play"));
    audio.dispatchEvent(new Event("ended"));

    await vi.advanceTimersByTimeAsync(1200);

    expect(playSpy).toHaveBeenCalledTimes(2);

    playSpy.mockRestore();
    vi.useRealTimers();
  });

  it("notifies the workspace when the audio training finishes", async () => {
    const onComplete = vi.fn();

    function CompletionHarness() {
      const { audioRef } = useAudioPlayback({
        audioUrl: "/api/audio/session-1",
        onComplete,
      });

      return <audio ref={audioRef} src="/api/audio/session-1" />;
    }

    const { container } = render(<CompletionHarness />);
    const audio = container.querySelector("audio");

    if (!audio) {
      throw new Error("Expected audio element to exist");
    }

    audio.dispatchEvent(new Event("ended"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
