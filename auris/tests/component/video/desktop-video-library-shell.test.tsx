import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopVideoLibraryShell } from "@/components/desktop/desktop-video-library-shell";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createDesktopBridge(
  hasLibrary: boolean,
  overrides?: Partial<NonNullable<DesktopBridge["videoLibrary"]>>,
): DesktopBridge {
  const snapshot = {
    directory: {
      analysisDirectory: hasLibrary ? "C:/Video Library/analysis" : null,
      directoryName: hasLibrary ? "Video Library" : null,
      hasLibrary,
      libraryPath: hasLibrary ? "C:/Video Library" : null,
      storageMode: "reference" as const,
      thumbnailsDirectory: hasLibrary ? "C:/Video Library/thumbnails" : null,
      transcodesDirectory: hasLibrary ? "C:/Video Library/transcodes" : null,
    },
    items: hasLibrary
      ? [
          {
            analysisStatus: "idle" as const,
            durationMs: 14_400_000,
            extension: ".mp4",
            fileSizeBytes: 128_000_000,
            height: 1080,
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
            width: 1920,
          },
        ]
      : [],
  };

  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({
        directoryPath: "C:/Users/test/Downloads",
      })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => ({
        lastRoute: "/video",
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        lastWorkspace: "workspace",
        legacyRuntimeMigratedAt: null,
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
        windowBounds: null,
      })),
      importLegacy: vi.fn(async () => ({
        lastRoute: "/video",
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        lastWorkspace: "workspace",
        legacyRuntimeMigratedAt: "2026-04-03T00:00:00.000Z",
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
        windowBounds: null,
      })),
      setLastWorkspace: vi.fn(async () => ({
        lastRoute: "/video",
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        lastWorkspace: "workspace",
        legacyRuntimeMigratedAt: null,
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
        windowBounds: null,
      })),
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
      getSnapshot: vi.fn(async () => snapshot),
      getVideoDetails: vi.fn(async () => null),
      importFiles: vi.fn(async () => snapshot),
      pickDirectory: vi.fn(async () => ({
        ...snapshot,
        directory: {
          ...snapshot.directory,
          analysisDirectory: "C:/Video Library/analysis",
          directoryName: "Video Library",
          hasLibrary: true,
          libraryPath: "C:/Video Library",
          thumbnailsDirectory: "C:/Video Library/thumbnails",
          transcodesDirectory: "C:/Video Library/transcodes",
        },
      })),
      refresh: vi.fn(async () => snapshot),
      revealDirectory: vi.fn(async () => undefined),
      saveThumbnail: vi.fn(async () => null),
      updateSourceMetadata: vi.fn(async () => null),
      ...overrides,
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  };
}

describe("DesktopVideoLibraryShell", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "shadowingDesktop");
  });

  it("explains that selecting an existing video folder scans it without modifying it", async () => {
    Object.assign(window, {
      shadowingDesktop: createDesktopBridge(false),
    });

    render(<DesktopVideoLibraryShell />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "本地视频库" })).toBeInTheDocument();
    });
    expect(screen.getByText("先选择一个视频文件夹")).toBeInTheDocument();
    expect(screen.getByText(/Auris 只会扫描并引用其中的视频/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择视频文件夹" })).toBeInTheDocument();
  });

  it("renders referenced videos and rescans the selected folder", async () => {
    const bridge = createDesktopBridge(true);
    Object.assign(window, {
      shadowingDesktop: bridge,
    });

    render(<DesktopVideoLibraryShell />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Lesson One/ })).toHaveAttribute(
        "href",
        "/video/video-lesson-one",
      );
    });
    expect(screen.getByText("C:/Video Library")).toBeInTheDocument();
    expect(screen.getByText("Lesson One")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "重新扫描" }));

    expect(bridge.videoLibrary?.refresh).toHaveBeenCalled();
  });
});
