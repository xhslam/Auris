import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnjoyShadowingStudio } from "@/components/player/enjoy-shadowing-studio";
import type { ReadingParagraph } from "@/features/reading/reading-fixtures";

const recordingMocks = vi.hoisted(() => ({
  delete: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
}));

const assessmentMocks = vi.hoisted(() => ({
  delete: vi.fn().mockResolvedValue([]),
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/recordings/local-recording-store", () => ({
  deleteLocalRecording: recordingMocks.delete,
  listLocalRecordings: recordingMocks.list,
  saveLocalRecording: recordingMocks.save,
}));

vi.mock("@/features/assessment/wav-recorder", () => ({
  startWavRecording: recordingMocks.start,
}));

vi.mock("@/features/assessment/local-pronunciation-assessment-store", () => ({
  getBrowserPronunciationAssessmentStorage: () => ({
    deleteAssessment: assessmentMocks.delete,
    listAssessments: assessmentMocks.list,
    saveAssessment: assessmentMocks.save,
  }),
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
    recordingMocks.delete.mockClear();
    recordingMocks.list.mockResolvedValue([]);
    recordingMocks.save.mockClear();
    assessmentMocks.delete.mockClear();
    assessmentMocks.list.mockResolvedValue([]);
    assessmentMocks.save.mockClear();
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

    expect(await screen.findByText("跟读结束后自动回放并进行发音分析。")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("知识会改变我们提出的问题。")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "跟读练习 one" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Curiosity" }));
    expect(onSeek).toHaveBeenCalledWith(expect.any(Number));
    expect(screen.getByRole("region", { name: "跟读练习 two" })).toBeInTheDocument();
  });

  it("supports loop, speed and display settings before the first recording", async () => {
    const user = userEvent.setup();
    renderStudio(12);
    await screen.findByText("跟读结束后自动回放并进行发音分析。");

    await user.click(screen.getByRole("button", { name: "单句循环" }));
    expect(screen.getByRole("button", { name: "单句循环" })).toHaveClass("is-active");

    await user.click(screen.getByRole("button", { name: "调整播放倍速" }));
    expect(screen.getByRole("slider", { name: "播放倍速" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "跟读显示设置" }));
    await user.click(screen.getByRole("checkbox", { name: "显示翻译" }));
    expect(screen.queryByText("知识会改变我们提出的问题。")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "发音评估" })).not.toBeInTheDocument();
  });

  it("keeps multiple sentence attempts even when assessment is unavailable", async () => {
    const user = userEvent.setup();
    renderStudio();
    await screen.findByText("跟读结束后自动回放并进行发音分析。");

    await user.click(screen.getByRole("button", { name: "开始跟读录音" }));
    await user.click(screen.getByRole("button", { name: "停止录音并评分" }));

    expect(await screen.findByText(/发音评估服务尚未配置/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始跟读录音" }));
    await user.click(screen.getByRole("button", { name: "停止录音并评分" }));

    const savedAttempts = recordingMocks.save.mock.calls.map(([attempt]) => attempt);
    const createdAttempts = savedAttempts.filter(
      (attempt) => attempt.assessmentStatus === "pending",
    );
    expect(createdAttempts).toHaveLength(2);
    expect(createdAttempts[0]).toEqual(expect.objectContaining({ title: "video-1:one" }));
    expect(createdAttempts[1]).toEqual(expect.objectContaining({ title: "video-1:one" }));
    expect(createdAttempts[0].id).not.toBe(createdAttempts[1].id);
    expect(screen.getByRole("option", { name: "练习 2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "练习 1" })).toBeInTheDocument();
    expect(screen.queryByText("Azure Speech 发音评估尚未配置。")).not.toBeInTheDocument();
  });

  it("deletes the selected attempt from recording and assessment storage", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderStudio();
    await screen.findByText("跟读结束后自动回放并进行发音分析。");

    await user.click(screen.getByRole("button", { name: "开始跟读录音" }));
    await user.click(screen.getByRole("button", { name: "停止录音并评分" }));
    await screen.findByText(/发音评估服务尚未配置/);
    const [createdAttempt] = recordingMocks.save.mock.calls[0] ?? [];

    await user.click(screen.getByRole("button", { name: "删除当前练习录音" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(recordingMocks.delete).toHaveBeenCalledWith(createdAttempt.id);
    expect(assessmentMocks.delete).toHaveBeenCalledWith(createdAttempt.id);
    expect(await screen.findByText("跟读结束后自动回放并进行发音分析。")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("starts and stops recording with the R shortcut", async () => {
    renderStudio();
    await screen.findByText("跟读结束后自动回放并进行发音分析。");

    fireEvent.keyDown(window, { code: "KeyR" });
    expect(await screen.findByRole("button", { name: "停止录音并评分" })).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "KeyR" });
    expect(await screen.findByText(/发音评估服务尚未配置/)).toBeInTheDocument();
    expect(recordingMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      assessmentStatus: "pending",
      title: "video-1:one",
    }));
  });

  it("shows persisted score details and word-level feedback", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        assessment: {
          accuracyScore: 82,
          completenessScore: 94,
          createdAt: "2026-08-16T00:00:00.000Z",
          fluencyScore: 88,
          id: "server-assessment",
          locale: "en-US",
          overallScore: 87,
          referenceText: paragraphs[0]?.english ?? "",
          sourceLabel: "Demo",
          wordAssessments: [
            { accuracyScore: 91, errorType: "None", word: "Knowledge" },
            { accuracyScore: 61, errorType: "Mispronunciation", word: "changes" },
          ],
        },
      }), { status: 200 }),
    ));
    renderStudio();
    await screen.findByText("跟读结束后自动回放并进行发音分析。");

    await user.click(screen.getByRole("button", { name: "开始跟读录音" }));
    await user.click(screen.getByRole("button", { name: "停止录音并评分" }));
    await user.click(await screen.findByRole("button", { name: "查看发音评估详情" }));

    expect(screen.getByRole("dialog", { name: "发音评估详情" })).toBeInTheDocument();
    expect(screen.getAllByText("87").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("changes").length).toBeGreaterThanOrEqual(2);
    expect(assessmentMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      overallScore: 87,
      sentenceId: "one",
      sourceId: "video-1",
    }));
  });
});
