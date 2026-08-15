import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnjoyShadowingStudio } from "@/components/player/enjoy-shadowing-studio";
import type { ReadingParagraph } from "@/features/reading/reading-fixtures";

const recordingMocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
}));

vi.mock("@/features/recordings/local-recording-store", () => ({
  listLocalRecordings: recordingMocks.list,
  saveLocalRecording: recordingMocks.save,
}));

vi.mock("@/features/assessment/wav-recorder", () => ({
  startWavRecording: recordingMocks.start,
}));

const paragraphs: ReadingParagraph[] = [
  {
    analysis: "",
    english: "Knowledge changes the questions we ask.",
    id: "one",
    order: 0,
    translation: "知识会改变我们提出的问题。",
    wordKeys: [],
  },
  {
    analysis: "",
    english: "Curiosity turns facts into understanding.",
    id: "two",
    order: 1,
    translation: "好奇心把事实转化为理解。",
    wordKeys: [],
  },
];

function renderStudio(currentTime = 0) {
  const onSeek = vi.fn();
  const onTogglePlay = vi.fn();
  render(
    <EnjoyShadowingStudio
      currentTime={currentTime}
      duration={20}
      fontScale={1}
      isPlaying={false}
      mediaRef={createRef<HTMLVideoElement>()}
      onSeek={onSeek}
      onTogglePlay={onTogglePlay}
      paragraphs={paragraphs}
      showTranslation
      sourceId="video-1"
      sourceLabel="Demo"
    />,
  );
  return { onSeek, onTogglePlay };
}

describe("EnjoyShadowingStudio", () => {
  beforeEach(() => {
    window.localStorage.clear();
    recordingMocks.list.mockResolvedValue([]);
    recordingMocks.save.mockClear();
    recordingMocks.start.mockResolvedValue({
      cleanup: vi.fn().mockResolvedValue(undefined),
      startedAt: Date.now(),
      stop: vi.fn().mockResolvedValue({
        blob: new Blob(["voice"], { type: "audio/wav" }),
        durationMs: 1250,
        mimeType: "audio/wav",
      }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        code: "AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED",
        message: "Azure Speech 发音评估尚未配置。",
      }), { status: 503 }),
    ));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders synchronized segments and seeks by segment", async () => {
    const user = userEvent.setup();
    const { onSeek } = renderStudio();

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("知识会改变我们提出的问题。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Curiosity" }));
    expect(onSeek).toHaveBeenCalledWith(expect.any(Number));
  });

  it("supports loop, speed, settings and AI tutor states", async () => {
    const user = userEvent.setup();
    renderStudio(12);

    await user.click(screen.getByRole("button", { name: /单句/ }));
    expect(screen.getByRole("button", { name: /单句/ })).toHaveClass("is-active");

    await user.click(screen.getByRole("button", { name: /倍速/ }));
    expect(screen.getByRole("slider", { name: "播放倍速" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByRole("checkbox", { name: "显示翻译" }));
    expect(screen.queryByText("知识会改变我们提出的问题。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "句子分析" }));
    expect(screen.getByRole("region", { name: "AI 导师" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成学习卡" }));
    expect(screen.getByText("结构拆解")).toBeInTheDocument();
  });

  it("overwrites one final recording slot even when assessment is unavailable", async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(screen.getByRole("button", { name: "开始跟读录音" }));
    await user.click(screen.getByRole("button", { name: "停止录音并评分" }));

    expect(recordingMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: "shadowing-studio-final-recording",
      title: "video-1:one",
    }));
    expect(await screen.findByText(/最终录音已保存；配置 Azure Speech/)).toBeInTheDocument();
    expect(screen.queryByText("Azure Speech 发音评估尚未配置。")).not.toBeInTheDocument();
  });
});
