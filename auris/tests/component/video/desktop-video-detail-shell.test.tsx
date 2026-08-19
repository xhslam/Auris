import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopVideoDetailShell } from "@/components/desktop/desktop-video-detail-shell";
import { READING_SOURCES } from "@/features/reading/reading-fixtures";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

const SCRIPT_SOURCE = READING_SOURCES[0]!;

function createDesktopBridge() {
  const runtimeState = {
    lastRoute: "/video/video-lesson-one",
    lastVisitedAt: "2026-04-03T00:00:00.000Z",
    lastWorkspace: "workspace" as const,
    legacyRuntimeMigratedAt: null,
    primaryResumeId: null,
    primaryResumeType: null,
    updatedAt: "2026-04-03T00:00:00.000Z",
    windowBounds: null,
  };

  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({ directoryPath: "C:/Users/test/Downloads" })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => runtimeState),
      importLegacy: vi.fn(async () => runtimeState),
      setLastWorkspace: vi.fn(async () => runtimeState),
    },
    system: {
      openUpgrade: vi.fn(async () => ({
        didOpen: true,
        targetUrl: "https://updates.example.com",
      })),
    },
    vault: {
      getDirectoryInfo: vi.fn(async () => ({
        directoryName: null,
        hasVault: false,
        pluginDirectory: null,
        vaultPath: null,
      })),
      listFiles: vi.fn(async () => []),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async () => null),
      removeFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    },
    videoLibrary: {
      getSnapshot: vi.fn(async () => ({
        directory: {
          analysisDirectory: "C:/Video Library/analysis",
          directoryName: "Video Library",
          hasLibrary: true,
          libraryPath: "C:/Video Library",
          storageMode: "reference" as const,
          thumbnailsDirectory: "C:/Video Library/thumbnails",
          transcodesDirectory: "C:/Video Library/transcodes",
        },
        items: [],
      })),
      getVideoDetails: vi.fn(async () => ({
        analysisJobs: [],
        variants: [
          {
            durationMs: 14_400_000,
            height: 1080,
            id: "variant-source",
            kind: "source" as const,
            label: "原始",
            mimeType: "video/mp4",
            playbackUrl: "shadowing-media://video/video-lesson-one/variant-source",
            status: "ready" as const,
            storagePath: "C:/Videos/lesson-one.mp4",
            width: 1920,
          },
        ],
        video: {
          analysisStatus: "idle" as const,
          durationMs: null,
          extension: ".mp4",
          fileSizeBytes: 128_000_000,
          height: null,
          id: "video-lesson-one",
          importState: "ready" as const,
          importedAt: "2026-04-03T00:00:00.000Z",
          mimeType: "video/mp4",
          playbackStrategy: "source-preferred" as const,
          posterUrl: null,
          sourceFileName: "lesson-one.mp4",
          sourcePath: "C:/Videos/lesson-one.mp4",
          sourceUrl: "file:///C:/Videos/lesson-one.mp4",
          title: "Lesson One",
          updatedAt: "2026-04-03T00:00:00.000Z",
          variantCount: 1,
          width: null,
        },
      })),
      importFiles: vi.fn(),
      pickDirectory: vi.fn(),
      refresh: vi.fn(),
      revealDirectory: vi.fn(async () => undefined),
      saveThumbnail: vi.fn(async () => null),
      updateSourceMetadata: vi.fn(async () => null),
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  } as unknown as DesktopBridge;
}

function mountWithBridge() {
  Object.assign(window, { shadowingDesktop: createDesktopBridge() });
  return render(<DesktopVideoDetailShell videoId="video-lesson-one" />);
}

function getRenderedVideo() {
  const video = document.querySelector("video");
  expect(video).not.toBeNull();
  return video as HTMLVideoElement;
}

function setVideoDuration(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: duration,
  });
  fireEvent.loadedMetadata(video);
}

describe("DesktopVideoDetailShell", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "shadowingDesktop");
    vi.unstubAllGlobals();
  });

  it("defaults to a clean watch workspace and opens the bilingual practice panel on demand", async () => {
    const user = userEvent.setup();
    const { container } = mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });

    const firstParagraph = SCRIPT_SOURCE.paragraphs[0]!;
    const workspace = container.querySelector(".video-study__body");
    const panel = container.querySelector(".video-study__practice-panel");

    expect(workspace).toHaveAttribute("data-workspace-mode", "watch");
    expect(panel).toBeNull();

    await user.click(screen.getByRole("button", { name: "打开英语陪练" }));

    const openedPanel = container.querySelector(".video-study__practice-panel");
    expect(workspace).toHaveAttribute("data-workspace-mode", "english-practice");
    expect(openedPanel).toHaveAttribute("data-open", "true");
    expect(screen.getByText(firstParagraph.translation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭英语陪练" })).toBeInTheDocument();
  });

  it("keeps the single video element and playback state when practice mode is opened or closed", async () => {
    const user = userEvent.setup();
    mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });
    const video = getRenderedVideo();
    setVideoDuration(video, 120);

    fireEvent.change(screen.getByRole("slider", { name: "播放进度" }), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "音量" }), {
      target: { value: "0.35" },
    });

    await user.click(screen.getByRole("button", { name: "打开英语陪练" }));
    expect(getRenderedVideo()).toBe(video);
    expect(video.currentTime).toBe(30);
    expect(video.volume).toBe(0.35);

    await user.click(screen.getByRole("button", { name: "调整播放倍速" }));
    fireEvent.change(screen.getByRole("slider", { name: "播放倍速" }), {
      target: { value: "1.5" },
    });
    await waitFor(() => expect(video.playbackRate).toBe(1.5));

    await user.click(screen.getByRole("button", { name: "关闭英语陪练" }));
    expect(getRenderedVideo()).toBe(video);
    expect(video.currentTime).toBe(30);
    expect(video.volume).toBe(0.35);
    expect(video.playbackRate).toBe(1.5);

    await user.click(screen.getByRole("button", { name: "打开英语陪练" }));
    expect(getRenderedVideo()).toBe(video);
    expect(video.currentTime).toBe(30);
    expect(video.volume).toBe(0.35);
    expect(video.playbackRate).toBe(1.5);
  });

  it("allows the English practice panel width to be adjusted with its divider", async () => {
    const user = userEvent.setup();
    const { container } = mountWithBridge();

    await screen.findByRole("button", { name: "打开英语陪练" });
    await user.click(screen.getByRole("button", { name: "打开英语陪练" }));

    const workspace = container.querySelector(".video-study__body") as HTMLDivElement;
    const panel = container.querySelector(".video-study__practice-panel") as HTMLElement;
    workspace.getBoundingClientRect = () => ({ width: 1200 } as DOMRect);
    panel.getBoundingClientRect = () => ({ width: 420 } as DOMRect);

    const divider = screen.getByRole("button", { name: "调整英语陪练宽度" });
    fireEvent.pointerDown(divider, { clientX: 900 });
    fireEvent.pointerMove(window, { clientX: 840 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(workspace.style.getPropertyValue("--vs-practice-panel-width")).toBe("480px");
    });
  });

  it("hides the Chinese translation when 中译 is toggled off", async () => {
    const user = userEvent.setup();
    mountWithBridge();

    const firstTranslation = SCRIPT_SOURCE.paragraphs[0]!.translation;
    await user.click(await screen.findByRole("button", { name: "打开英语陪练" }));
    await waitFor(() => {
      expect(screen.getByText(firstTranslation)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "切换双语翻译" }));
    expect(screen.queryByText(firstTranslation)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "切换双语翻译" }));
    expect(screen.getByText(firstTranslation)).toBeInTheDocument();
  });

  it("toggles between dark and light theme", async () => {
    const user = userEvent.setup();
    const { container } = mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });

    // 默认跟随全局主题，初始为 light；夜读控制属于英语陪练的显示设置。
    const root = container.querySelector(".video-study");
    expect(root).toHaveAttribute("data-theme", "light");

    await user.click(screen.getByRole("button", { name: "打开英语陪练" }));
    await user.click(screen.getByRole("button", { name: "切换到黑夜模式" }));
    expect(root).toHaveAttribute("data-theme", "dark");

    await user.click(screen.getByRole("button", { name: "切换到白天模式" }));
    expect(root).toHaveAttribute("data-theme", "light");
  });

  it("opens the font-size slider from the Aa button", async () => {
    const user = userEvent.setup();
    mountWithBridge();

    await user.click(await screen.findByRole("button", { name: "打开英语陪练" }));
    const aaButton = await screen.findByRole("button", { name: "调节字号" });
    expect(screen.queryByRole("slider", { name: "调节字号" })).not.toBeInTheDocument();

    await user.click(aaButton);
    expect(screen.getByRole("slider", { name: "调节字号" })).toBeInTheDocument();
  });

  it("hides playback controls while a video is playing and reveals them on movement", async () => {
    mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });

    const player = document.querySelector(".video-study__player-frame") as HTMLElement;
    const video = getRenderedVideo();

    vi.useFakeTimers();
    try {
      fireEvent.play(video);
      expect(player).toHaveAttribute("data-controls-visible", "true");

      act(() => {
        vi.advanceTimersByTime(2300);
      });
      expect(player).toHaveAttribute("data-controls-visible", "false");

      fireEvent.mouseMove(player);
      expect(player).toHaveAttribute("data-controls-visible", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports play/pause, seeking, volume, mute, and fullscreen controls", async () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function playMock(this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: false });
        fireEvent.play(this);
        return Promise.resolve();
      });
    const pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(function pauseMock(this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: true });
        fireEvent.pause(this);
      });

    mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });

    const player = document.querySelector(".video-study__player-frame") as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };
    const requestFullscreen = vi.fn(async () => undefined);
    player.requestFullscreen = requestFullscreen;

    const video = getRenderedVideo();
    setVideoDuration(video, 120);

    await userEvent.click(screen.getAllByRole("button", { name: "播放视频" })[0]!);
    expect(playSpy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "暂停视频" }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("slider", { name: "播放进度" }), {
      target: { value: "30" },
    });
    expect(video.currentTime).toBe(30);

    fireEvent.change(screen.getByRole("slider", { name: "音量" }), {
      target: { value: "0.35" },
    });
    expect(video.volume).toBe(0.35);

    await userEvent.click(screen.getByRole("button", { name: "静音" }));
    expect(video.muted).toBe(true);
    expect(screen.getByRole("button", { name: "取消静音" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "进入全屏" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("opens a word card with the definition when a vocab word is right-clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          entry: {
            meanings: [
              {
                definitions: ["the force that keeps progress moving once it has started"],
                lexicalCategory: "名词",
              },
            ],
            personal: {
              definition: "the force that keeps progress moving once it has started",
              fileName: "momentum.md",
              sections: [
                {
                  lines: ["核心意象: 已经动起来的东西继续向前。"],
                  title: "核心语义",
                },
              ],
              source: {},
            },
            pronunciations: ["/məˈmentəm/"],
            sourceLabel: "个人词库",
            synonyms: [],
            word: "Momentum",
          },
        }),
        ok: true,
      })),
    );
    mountWithBridge();

    await waitFor(() => {
      expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getByRole("button", { name: "打开英语陪练" }));

    // 取当前跟读台中的 "momentum" 单词按钮。
    const vocabWord = screen.getAllByRole("button", { name: /momentum/i })[0];
    expect(vocabWord).toBeDefined();

    fireEvent.contextMenu(vocabWord!);

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "词条释义" })).toBeInTheDocument();
    });
    const wordCard = screen.getByRole("complementary", { name: "词条释义" });
    expect(wordCard).toHaveClass("floating-word-card");
    expect(wordCard.style.left).toBe(`${(window.innerWidth - 560) / 2}px`);
    expect(wordCard.style.top).toBe(`${(window.innerHeight - 360) / 2}px`);
    expect(wordCard.querySelector(".video-study__popover")).not.toBeNull();
    expect(await screen.findByRole("region", { name: "在这句话里" })).toBeInTheDocument();
    expect(
      screen.queryByText("核心意象: 已经动起来的东西继续向前。"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "词源构词" }));

    expect(screen.getByRole("region", { name: "词源构词" })).toBeInTheDocument();
    expect(screen.getByText("核心意象: 已经动起来的东西继续向前。")).toBeInTheDocument();
  });
});
