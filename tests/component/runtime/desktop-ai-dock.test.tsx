import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopAiDockShell } from "@/components/ai-dock/ai-dock-shell";
import { clampDesktopAiDockWidth } from "@/features/ai-dock/ai-dock-layout";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import type {
  DesktopAiHistoryRecord,
  DesktopAiPromptRecord,
  DesktopBridge,
} from "@/platform/desktop/desktop-bridge";

function createPromptRecord(
  overrides: Partial<DesktopAiPromptRecord> = {},
): DesktopAiPromptRecord {
  return {
    category: "Writing",
    content: "Rewrite this paragraph in concise English.",
    id: 1,
    isFavorite: true,
    lastUsed: null,
    tags: ["rewrite"],
    title: "Rewrite Paragraph",
    useCount: 0,
    variables: ["tone"],
    ...overrides,
  };
}

function createHistoryRecord(
  overrides: Partial<DesktopAiHistoryRecord> = {},
): DesktopAiHistoryRecord {
  return {
    content: "# Summary\n\nThis is a saved conversation.",
    conversationId: "conversation-1",
    id: 1,
    isFavorite: false,
    modifiedAt: 1_710_000_000_000,
    notes: "Captured from provider",
    provider: "chatgpt",
    tags: ["summary"],
    timestamp: 1_710_000_000_000,
    title: "Captured chat",
    url: "https://chatgpt.com/c/conversation-1",
    ...overrides,
  };
}

function createDesktopBridge(): DesktopBridge {
  const promptRecords = [createPromptRecord()];
  const historyRecords = [createHistoryRecord()];

  return {
    aiDock: {
      setActiveProvider: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      setActiveView: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      setVisibility: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      syncLayout: vi.fn(async (layout) => layout),
    },
    aiHistory: {
      captureCurrentConversation: vi.fn(async () =>
        createHistoryRecord({
          conversationId: "conversation-2",
          id: 2,
          title: "Fresh capture",
        }),
      ),
      delete: vi.fn(async () => historyRecords),
      export: vi.fn(async () => ({
        conversations: historyRecords,
        exportDate: "2026-04-16T00:00:00.000Z",
        version: "1.0",
      })),
      import: vi.fn(async () => ({ errors: [], imported: 0, skipped: 0 })),
      list: vi.fn(async () => historyRecords),
      save: vi.fn(async () => historyRecords[0] ?? null),
      search: vi.fn(async (query: string) =>
        historyRecords.filter((record) =>
          record.title.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
      toggleFavorite: vi.fn(async (id: number) =>
        historyRecords.find((record) => record.id === id) ?? null,
      ),
    },
    aiPrompts: {
      delete: vi.fn(async () => promptRecords),
      export: vi.fn(async () => ({
        exportDate: "2026-04-16T00:00:00.000Z",
        prompts: promptRecords,
        version: "1.0",
      })),
      import: vi.fn(async () => ({ errors: [], imported: 0, skipped: 0 })),
      importDefaultLibrary: vi.fn(async () => ({ errors: [], imported: 3, skipped: 0 })),
      list: vi.fn(async () => promptRecords),
      save: vi.fn(async () => promptRecords[0] ?? null),
      search: vi.fn(async (query: string) =>
        promptRecords.filter((record) =>
          record.title.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
      update: vi.fn(async (id: number) =>
        promptRecords.find((record) => record.id === id) ?? null,
      ),
    },
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/ai-export.json" })),
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
        ...DEFAULT_DESKTOP_RUNTIME_STATE,
        aiDock: {
          activeProvider: "chatgpt" as const,
          activeView: "provider" as const,
          isOpen: false,
          panelWidth: 560,
        },
      })),
      importLegacy: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      setLastWorkspace: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
    },
    system: {
      openUpgrade: vi.fn(async () => ({
        didOpen: true,
        targetUrl: "https://updates.example.com",
      })),
    },
    voiceEngine: {
      generate: vi.fn(async () => ({
        audioBase64: "",
        contentType: "audio/wav",
        durationMs: 1200,
        transcriptWords: [],
      })),
      getCapabilities: vi.fn(async () => ({
        locales: ["en-US"],
        modes: ["preset" as const],
        supportsReferenceAudio: false,
        supportsStylePrompt: true,
      })),
      getStatus: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      start: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      stop: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: "manual_stop",
        state: "degraded" as const,
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
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  };
}

describe("DesktopAiDockShell", () => {
  beforeEach(() => {
    vi.useRealTimers();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.pushState(null, "", "/");
  });

  it("opens the prompt library from AI Dock route parameters", async () => {
    window.history.pushState(null, "", "/notes?aiDock=prompts&intent=summary");
    const desktopBridge = createDesktopBridge();

    const { container } = render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("desktop-ai-dock")).toHaveAttribute("data-open", "true");
    });

    expect(container.querySelector(".desktop-ai-dock__surface")).toHaveAttribute(
      "data-view",
      "prompts",
    );
    expect(screen.getByRole("searchbox", { name: "Search prompt library" })).toHaveValue(
      "总结笔记",
    );
  });

  it("reveals the dock from the right edge and hides it again after moving away while collapsed", () => {
    vi.useFakeTimers();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    const shell = screen.getByTestId("desktop-ai-dock");
    const revealZone = screen.getByTestId("desktop-ai-dock-reveal-zone");

    expect(shell).toHaveAttribute("data-open", "false");
    expect(shell).toHaveAttribute("data-visible", "false");

    fireEvent.mouseEnter(revealZone);

    expect(shell).toHaveAttribute("data-visible", "true");

    fireEvent.mouseLeave(revealZone);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(shell).toHaveAttribute("data-open", "false");
    expect(shell).toHaveAttribute("data-visible", "false");
  });

  it("reveals the dock from right-edge mouse movement when the hover zone misses", () => {
    vi.useFakeTimers();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    const shell = screen.getByTestId("desktop-ai-dock");

    expect(shell).toHaveAttribute("data-open", "false");
    expect(shell).toHaveAttribute("data-visible", "false");

    fireEvent.mouseMove(window, { clientX: 1_270 });

    expect(shell).toHaveAttribute("data-visible", "true");
  });

  it("keeps the dock visible after opening it from the edge reveal interaction", () => {
    vi.useFakeTimers();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    const shell = screen.getByTestId("desktop-ai-dock");
    const revealZone = screen.getByTestId("desktop-ai-dock-reveal-zone");

    fireEvent.mouseEnter(revealZone);
    fireEvent.click(screen.getByRole("button", { name: "Open AI sidebar" }));

    expect(shell).toHaveAttribute("data-open", "true");
    expect(shell).toHaveAttribute("data-visible", "true");

    fireEvent.mouseLeave(shell);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(shell).toHaveAttribute("data-open", "true");
    expect(shell).toHaveAttribute("data-visible", "true");
  });

  it("reserves layout width for the workspace once the dock is opened", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();

    render(
      <div className="desktop-app-frame__layout" style={{ height: "900px", width: "1280px" }}>
        <div data-testid="workspace-main" />
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    const spacer = screen.getByTestId("desktop-ai-dock-layout-spacer");

    expect(spacer).toHaveAttribute("data-reserved", "false");
    expect(spacer).toHaveStyle({ width: "0px" });

    fireEvent.mouseEnter(screen.getByTestId("desktop-ai-dock-reveal-zone"));
    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));

    await waitFor(() => {
      expect(spacer).toHaveAttribute("data-reserved", "true");
    });

    expect(spacer).not.toHaveStyle({ width: "0px" });
  });

  it("opens from the edge tab and switches between provider, prompt, and history views", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    const shell = screen.getByTestId("desktop-ai-dock");
    const revealZone = screen.getByTestId("desktop-ai-dock-reveal-zone");

    expect(shell).toHaveAttribute("data-open", "false");
    expect(shell).toHaveAttribute("data-visible", "false");

    fireEvent.mouseEnter(revealZone);

    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));

    await waitFor(() => {
      expect(shell).toHaveAttribute("data-open", "true");
    });

    expect(desktopBridge.aiDock?.syncLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        activeProvider: "chatgpt",
        activeView: "provider",
        isOpen: true,
      }),
    );
    expect(desktopBridge.aiDock?.setVisibility).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Prompt Library" }));

    expect(await screen.findByText("Rewrite Paragraph")).toBeInTheDocument();
    expect(desktopBridge.aiDock?.setActiveView).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Chat History" }));

    expect(
      await screen.findByRole("heading", { level: 3, name: "Captured chat" }),
    ).toBeInTheDocument();
    expect(desktopBridge.aiDock?.syncLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeView: "history",
        isOpen: true,
      }),
    );
  });

  it("clamps width changes and syncs layout back to Electron", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    fireEvent.mouseEnter(screen.getByTestId("desktop-ai-dock-reveal-zone"));
    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));

    const separator = await screen.findByRole("separator", {
      name: "Resize AI dock",
    });

    act(() => {
      fireEvent.mouseDown(separator, { clientX: 900 });
      fireEvent.mouseMove(window, { clientX: -200 });
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      const expectedWidth = clampDesktopAiDockWidth(1_660, window.innerWidth);

      expect(desktopBridge.aiDock?.syncLayout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: true,
          panelWidth: expectedWidth,
        }),
      );
    });
  });

  it("captures the current provider conversation into chat history", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    fireEvent.mouseEnter(screen.getByTestId("desktop-ai-dock-reveal-zone"));
    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));
    await user.click(screen.getByRole("tab", { name: "Chat History" }));
    await user.click(screen.getByRole("button", { name: "Save current conversation" }));

    await waitFor(() => {
      expect(desktopBridge.aiHistory?.captureCurrentConversation).toHaveBeenCalledWith(
        "chatgpt",
      );
    });
  });

  it("queries the prompt library when the user searches inside the dock", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();
    const promptRecords = [
      createPromptRecord(),
      createPromptRecord({
        category: "Review",
        content: "Summarize the lesson into three shadowing checkpoints.",
        id: 2,
        tags: ["summary"],
        title: "Summarize Lesson",
      }),
    ];

    if (!desktopBridge.aiPrompts) {
      throw new Error("desktopBridge.aiPrompts is required");
    }
    desktopBridge.aiPrompts.list = vi.fn(async () => promptRecords);
    desktopBridge.aiPrompts.search = vi.fn(async (query: string) =>
      promptRecords.filter((record) =>
        [record.title, record.content, ...record.tags]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    );

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    fireEvent.mouseEnter(screen.getByTestId("desktop-ai-dock-reveal-zone"));
    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));
    await user.click(screen.getByRole("tab", { name: "Prompt Library" }));

    expect(await screen.findByText("Rewrite Paragraph")).toBeInTheDocument();
    expect(await screen.findByText("Summarize Lesson")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search prompt library" }), "summary");

    await waitFor(() => {
      expect(desktopBridge.aiPrompts?.search).toHaveBeenLastCalledWith("summary");
    });
    expect(await screen.findByText("Summarize Lesson")).toBeInTheDocument();
    expect(screen.queryByText("Rewrite Paragraph")).not.toBeInTheDocument();
  });

  it("uses an immersive compact toolbar for the provider view and restores the full header for library views", async () => {
    const user = userEvent.setup();
    const desktopBridge = createDesktopBridge();

    render(
      <div style={{ height: "900px", width: "1280px" }}>
        <DesktopAiDockShell desktopBridge={desktopBridge} />
      </div>,
    );

    fireEvent.mouseEnter(screen.getByTestId("desktop-ai-dock-reveal-zone"));
    await user.click(screen.getByRole("button", { name: "Open AI sidebar" }));

    await waitFor(() => {
      expect(screen.getByTestId("desktop-ai-dock")).toHaveAttribute("data-open", "true");
    });

    expect(screen.queryByText("Desktop AI")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Provider" })).not.toBeInTheDocument();
    expect(screen.queryByText("Session is hosted directly in Electron.")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "AI views" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByTestId("desktop-ai-dock-provider-host")).toHaveAttribute(
      "data-immersive",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Prompt Library" }));

    expect(await screen.findByText("Desktop AI")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Prompt Library" })).toBeInTheDocument();
  });
});
