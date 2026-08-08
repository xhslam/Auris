import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaybackDock } from "@/components/player/playback-dock";

describe("PlaybackDock", () => {
  it("renders in compact mode by default and expands on demand", async () => {
    const user = userEvent.setup();

    render(
      <PlaybackDock
        activeSentenceLabel="Learning a language is not only about vocabulary."
        currentTimeMs={1200}
        durationMs={5400}
        hasPlayback
        isLoading={false}
        isPlaying={false}
        onReplaySentence={vi.fn()}
        onSetPlaybackRate={vi.fn()}
        onTogglePlayback={vi.fn()}
        playbackRate={1}
        repeatCount={1}
        repeatIntervalSec={1}
      />,
    );

    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
    expect(screen.getByText("待继续")).toBeInTheDocument();
    expect(screen.queryByText("重复 2 遍")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开" }));

    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
    expect(screen.getByText("状态 待继续")).toBeInTheDocument();
    expect(screen.getByText("重复 2 遍")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0.8x" })).toBeInTheDocument();
  });
});
