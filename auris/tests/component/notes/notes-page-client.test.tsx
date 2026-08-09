import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesPageClient } from "@/components/notes-v2/notes-page-client";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NEW_NOTE_BODY_PLACEHOLDER } from "@/features/notes/documents/note-editing-source";
import { clearAllPendingNoteSaves } from "@/features/notes/workbench/notes-pending-saves";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";
import type { EditorView as ProseMirrorEditorView } from "prosemirror-view";

type NotesRichEditorHostElement = HTMLDivElement & {
  __notesRichEditorView?: ProseMirrorEditorView;
};

type TestDesktopBridge = DesktopBridge & {
  writeExternalFile: (relativePath: string, content: string) => void;
};

const { detectRuntimeMock, getDesktopBridgeMock } = vi.hoisted(() => ({
  detectRuntimeMock: vi.fn(() => ({
    isDesktopApp: true,
    isNativeApp: false,
    platform: "desktop" as const,
  })),
  getDesktopBridgeMock: vi.fn<() => DesktopBridge | null>(),
}));

vi.mock("@/components/desktop/desktop-app-frame", () => ({
  DesktopAppFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="desktop-app-frame">{children}</div>
  ),
}));

vi.mock("@/platform/runtime", () => ({
  detectRuntime: detectRuntimeMock,
}));

vi.mock("@/platform/desktop/desktop-runtime", () => ({
  getDesktopBridge: getDesktopBridgeMock,
}));

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runPendingTimers(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
  }
}

function createDesktopBridgeWithDelayedRefresh(
  initialVaultFiles: Array<[string, string]> = [
    [
      "notes/rhythm-drill.md",
      "# Rhythm Drill\n\nRepeat the rhythm phrase until the stress pattern feels natural.\n",
    ],
  ],
): TestDesktopBridge {
  const vaultFiles = new Map<string, string>(initialVaultFiles);
  let vaultListeners: Array<() => void> = [];
  let runtimeState = {
    aiDock: {
      activeProvider: "chatgpt" as const,
      activeView: "provider" as const,
      isOpen: false,
      panelWidth: 560,
    },
    lastRoute: "/notes",
    lastVisitedAt: null,
    lastWorkspace: "notes" as const,
    legacyRuntimeMigratedAt: null,
    primaryResumeId: null,
    primaryResumeType: null,
    updatedAt: null,
    windowBounds: null,
  };

  const delayMs = 80;

  const bridge: TestDesktopBridge = {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: true })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({
        path: "C:/Users/test/Downloads/export.json",
      })),
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
      get: vi.fn(async () => runtimeState),
      importLegacy: vi.fn(async (legacyState) => {
        runtimeState = {
          ...runtimeState,
          ...legacyState,
        };
        return runtimeState;
      }),
      setLastWorkspace: vi.fn(async (workspace) => {
        runtimeState = {
          ...runtimeState,
          lastWorkspace: workspace,
        };
        return runtimeState;
      }),
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
        durationMs: 0,
        transcriptWords: [],
      })),
      getCapabilities: vi.fn(async () => ({
        locales: [],
        modes: [],
        supportsReferenceAudio: false,
        supportsStylePrompt: false,
      })),
      getStatus: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "test",
        reason: null,
        state: "not_configured" as const,
      })),
      start: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "test",
        reason: null,
        state: "not_configured" as const,
      })),
      stop: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "test",
        reason: null,
        state: "not_configured" as const,
      })),
    },
    vault: {
      createDirectory: vi.fn(async () => undefined),
      getDirectoryInfo: vi.fn(async () => {
        await wait(delayMs);
        return {
          directoryName: "English Vault",
          hasVault: true,
          pluginDirectory: "C:/vault/.shadowing/plugins",
          vaultPath: "C:/vault",
        };
      }),
      listFiles: vi.fn(async () => {
        await wait(delayMs);
        return [...vaultFiles.keys()].map((relativePath) => ({
          absolutePath: `C:/vault/${relativePath}`,
          fileName: relativePath.split("/").at(-1) ?? relativePath,
          relativePath,
        }));
      }),
      moveFile: vi.fn(async (fromPath: string, toPath: string) => {
        const content = vaultFiles.get(fromPath);
        if (!content) {
          return;
        }
        vaultFiles.delete(fromPath);
        vaultFiles.set(toPath, content);
        vaultListeners.forEach((listener) => listener());
      }),
      onDidChange: vi.fn((listener: () => void) => {
        vaultListeners.push(listener);

        return () => {
          vaultListeners = vaultListeners.filter((entry) => entry !== listener);
        };
      }),
      pickDirectory: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async (relativePath: string) => {
        await wait(delayMs);
        return vaultFiles.get(relativePath) ?? null;
      }),
      removeFile: vi.fn(async (relativePath: string) => {
        vaultFiles.delete(relativePath);
        vaultListeners.forEach((listener) => listener());
      }),
      renameFile: vi.fn(async (fromPath: string, toPath: string) => {
        const content = vaultFiles.get(fromPath);
        if (!content) {
          return;
        }
        vaultFiles.delete(fromPath);
        vaultFiles.set(toPath, content);
        vaultListeners.forEach((listener) => listener());
      }),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async (relativePath: string, content: string) => {
        vaultFiles.set(relativePath, content);
        vaultListeners.forEach((listener) => listener());
      }),
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
    writeExternalFile: (relativePath: string, content: string) => {
      vaultFiles.set(relativePath, content);
      vaultListeners.forEach((listener) => listener());
    },
  };

  return bridge;
}

describe("NotesPageClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getDesktopBridgeMock.mockReset();
    detectRuntimeMock.mockClear();
    getDesktopBridgeMock.mockReturnValue(
      createDesktopBridgeWithDelayedRefresh(),
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearAllPendingNoteSaves();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts on the welcome page and enters the workbench after choosing a folder", async () => {
    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId("desktop-app-frame")).toBeInTheDocument();
    expect(screen.getByTestId("notes-page-frame")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /打开文件夹/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /打开文件夹/ }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId("notes-workbench")).toBeInTheDocument();
  });

  it("loads every vault note before presenting the relationship graph", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh([
      ["notes/rhythm-drill.md", "# Rhythm\n\n[[Target]] [[Missing]]\n"],
      ["notes/z-target.md", "# Target\n\n[[Rhythm]]\n"],
      ["notes/zz-lonely.md", "# Lonely\n"],
    ]);
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient resumeNoteId="notes/rhythm-drill.md" />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    fireEvent.click(screen.getByRole("button", { name: /打开文件夹/ }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const readFile = vi.mocked(desktopBridge.vault.readFile);
    expect(readFile).toHaveBeenCalledWith("notes/rhythm-drill.md");
    expect(readFile).not.toHaveBeenCalledWith("notes/z-target.md");
    expect(readFile).not.toHaveBeenCalledWith("notes/zz-lonely.md");

    fireEvent.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.rightRail.graph.open }),
    );
    expect(screen.getByTestId("notes-graph-pending")).toBeInTheDocument();
    expect(screen.queryByText(/1 篇笔记/u)).not.toBeInTheDocument();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(readFile).toHaveBeenCalledWith("notes/z-target.md");
    expect(readFile).toHaveBeenCalledWith("notes/zz-lonely.md");

    fireEvent.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.panels.graph.scopeVault }),
    );
    expect(screen.getByText(/3 篇笔记/u)).toBeInTheDocument();
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.unresolved(1), { exact: false }),
    ).toBeInTheDocument();

    const targetReadsBeforeRefresh = readFile.mock.calls.filter(
      ([path]) => path === "notes/z-target.md",
    ).length;
    fireEvent.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.rightRail.graph.open }),
    );
    desktopBridge.writeExternalFile(
      "notes/rhythm-drill.md",
      "# Rhythm\n\n[[Target]] [[Missing]]\n\nChanged externally.\n",
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(
      readFile.mock.calls.filter(([path]) => path === "notes/z-target.md").length,
    ).toBe(targetReadsBeforeRefresh);
  });

  it("does not show a loading banner during autosave-driven vault refreshes", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    await act(async () => {
      if (!view) {
        throw new Error("Expected the notes editor to be ready.");
      }

      view.dispatch(view.state.tr.insertText("abc", view.state.doc.content.size));
    });

    expect(
      screen.queryByText(NOTES_UI_COPY.banners.loading),
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(29_999);
      await Promise.resolve();
    });

    expect(
      screen.queryByText(NOTES_UI_COPY.banners.loading),
    ).not.toBeInTheDocument();
    expect(desktopBridge.vault.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    await runPendingTimers(2);
  });

  it("autosaves the active note shortly after typing settles", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("quick save", view.state.doc.content.size));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("quick save"),
    );
  });

  it("keeps a note dirty when the user edits while autosave is still writing", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    const saveFileImmediately = desktopBridge.vault.saveFile;
    desktopBridge.vault.saveFile = vi.fn(
      async (relativePath: string, content: string) => {
        await wait(80);
        await saveFileImmediately(relativePath, content);
      },
    );
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("first draft", view.state.doc.content.size));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.dispatch(view.state.tr.insertText(" second draft", view.state.doc.content.size));
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(80);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenLastCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("second draft"),
    );
  });

  it("does not show an external-editor conflict when a queued autosave follows an earlier autosave", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    const saveFileImmediately = desktopBridge.vault.saveFile;
    desktopBridge.vault.saveFile = vi.fn(
      async (relativePath: string, content: string) => {
        await wait(10_000);
        await saveFileImmediately(relativePath, content);
      },
    );
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("slow first", view.state.doc.content.size));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.dispatch(view.state.tr.insertText(" queued second", view.state.doc.content.size));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(80);
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
    });

    expect(
      screen.queryByRole("dialog", {
        name: NOTES_UI_COPY.dialogs.externalEditorConflict.title,
      }),
    ).not.toBeInTheDocument();
    expect(desktopBridge.vault.saveFile).toHaveBeenLastCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("queued second"),
    );
  });

  it("does not interrupt typing with a conflict dialog from the autosave write path", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const readFileNormally = desktopBridge.vault.readFile;
    let injectUnexpectedRead = true;
    desktopBridge.vault.readFile = vi.fn(async (relativePath: string) => {
      if (injectUnexpectedRead) {
        injectUnexpectedRead = false;
        await wait(80);
        return "# Rhythm Drill\n\nUnsignaled disk state.\n";
      }

      return readFileNormally(relativePath);
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("keep typing", view.state.doc.content.size));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(
      screen.queryByRole("dialog", {
        name: NOTES_UI_COPY.dialogs.externalEditorConflict.title,
      }),
    ).not.toBeInTheDocument();
  });

  it("saves the active note immediately with Mod+S", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("abc", view.state.doc.content.size));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("abc"),
    );
  });

  it("saves the latest in-memory draft when Mod+S is pressed immediately after typing", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(
        view.state.tr.insertText("instant save", view.state.doc.content.size),
      );
      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("instant save"),
    );
  });

  it("shows a write conflict when a dirty note changes externally", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient resumeNoteId="notes/rhythm-drill.md" />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      view.dispatch(view.state.tr.insertText("\nLocal draft", view.state.doc.content.size));
      await vi.advanceTimersByTimeAsync(180);
      await Promise.resolve();
    });

    await act(async () => {
      desktopBridge.writeExternalFile(
        "notes/rhythm-drill.md",
        "# Rhythm Drill\n\nExternal editor changed this file.\n",
      );
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("dialog", {
        name: NOTES_UI_COPY.dialogs.externalEditorConflict.title,
      }),
    ).toBeInTheDocument();
    expect(desktopBridge.vault.saveFile).not.toHaveBeenCalled();
  });

  it("renames an existing note's file when its title is edited", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient resumeNoteId="notes/rhythm-drill.md" />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      const titleLength = view.state.doc.firstChild?.textContent.length ?? 0;
      view.dispatch(view.state.tr.insertText("Music Notes", 1, titleLength + 1));
      await Promise.resolve();
    });
    // The rename is a second-order effect that fires once the VMark-style
    // autosave window settles and the title-to-file-name sync debounce runs.
    await runPendingTimers(6);

    // The edited title is saved, then the file is renamed to match and the
    // editor follows it to the new path.
    expect(desktopBridge.vault.saveFile).toHaveBeenCalledWith(
      "notes/rhythm-drill.md",
      expect.stringContaining("# Music Notes"),
    );
    expect(desktopBridge.vault.renameFile).toHaveBeenCalledWith(
      "notes/rhythm-drill.md",
      "notes/music-notes.md",
    );
    expect(screen.getByText("notes/music-notes.md")).toBeInTheDocument();
  });

  it("keeps the edited title visible while the resumed vault is saving", async () => {
    render(<NotesPageClient resumeNoteId="notes/rhythm-drill.md" />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      const titleLength = view.state.doc.firstChild?.textContent.length ?? 0;
      view.dispatch(view.state.tr.insertText("Music Notes", 1, titleLength + 1));
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(screen.getByTestId("notes-prosemirror-host")).toHaveTextContent(
      "Music Notes",
    );
  });

  it("creates new notes with a blank title and body placeholder", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      screen.getByRole("button", { name: NOTES_UI_COPY.headerActions.newNote }).click();
      await vi.runAllTimersAsync();
    });

    expect(desktopBridge.vault.saveFile).toHaveBeenCalledWith(
      "notes/study-note-2.md",
      `${NEW_NOTE_BODY_PLACEHOLDER}\n`,
    );

    const host = screen.getByTestId("notes-prosemirror-host");
    const titleInput = screen.getByLabelText("Note title");

    expect(titleInput).toHaveValue("");
    expect(host).toHaveTextContent(NEW_NOTE_BODY_PLACEHOLDER);
    expect(host).not.toHaveTextContent("Study Note 2");
  });

  it("lets a freshly created note take focus even when a resume target is set", async () => {
    // Regression: the ?resumeNoteId=… target must only seed the *initial* active
    // note. Previously it kept winning on every render, so creating (or opening)
    // another note got yanked straight back to the resumed note — the editor
    // looked frozen and nothing the user clicked would open.
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient resumeNoteId="notes/rhythm-drill.md" />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The resume target is honored first…
    expect(
      screen.getByRole("button", {
        name: /workspace switcher for Rhythm Drill/i,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      screen
        .getByRole("button", { name: NOTES_UI_COPY.headerActions.newNote })
        .click();
      await vi.runAllTimersAsync();
    });

    // …but the brand-new blank note must now hold focus, not the resumed note.
    const titleInput = screen.getByLabelText("Note title");
    const host = screen.getByTestId("notes-prosemirror-host");
    expect(titleInput).toHaveValue("");
    expect(host).toHaveTextContent(NEW_NOTE_BODY_PLACEHOLDER);
    expect(host).not.toHaveTextContent("Rhythm Drill");
  });

  it("renames the file to follow the title once a new note is given one", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh();
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Create a fresh blank note — it lands as notes/study-note-N.md.
    await act(async () => {
      screen
        .getByRole("button", { name: NOTES_UI_COPY.headerActions.newNote })
        .click();
      await vi.runAllTimersAsync();
    });

    // A brand-new note exposes a dedicated title input; naming it (and blurring
    // to commit) should rename the underlying file to match.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Note title"), {
        target: { value: "Reading Notes" },
      });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("Note title"));
      await Promise.resolve();
    });
    // The rename is a second-order effect that fires once the VMark-style
    // autosave window settles and the title-to-file-name sync debounce runs.
    await runPendingTimers(6);

    // The file name follows the title, and the editor stays on the renamed file.
    expect(desktopBridge.vault.renameFile).toHaveBeenCalledWith(
      expect.stringMatching(/^notes\/study-note-\d+\.md$/),
      "notes/reading-notes.md",
    );
    expect(screen.getByText("notes/reading-notes.md")).toBeInTheDocument();
  });

  it("does not overwrite an existing note when the edited title matches it", async () => {
    const desktopBridge = createDesktopBridgeWithDelayedRefresh([
      [
        "notes/a-rhythm-drill.md",
        "# Rhythm Drill\n\nRepeat the rhythm phrase until the stress pattern feels natural.\n",
      ],
      ["notes/music-notes.md", "# Music Notes\n\nKeep this note."],
    ]);
    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    if (!view) {
      throw new Error("Expected the notes editor to be ready.");
    }

    await act(async () => {
      const titleLength = view.state.doc.firstChild?.textContent.length ?? 0;
      view.dispatch(view.state.tr.insertText("Music Notes", 1, titleLength + 1));
      await vi.runAllTimersAsync();
    });

    expect(desktopBridge.vault.renameFile).not.toHaveBeenCalled();
    expect(screen.getByText("notes/a-rhythm-drill.md")).toBeInTheDocument();
  });

  it("does not flash the legacy empty editor while the desktop vault is loading", () => {
    render(<NotesPageClient />);

    expect(screen.getByText(NOTES_UI_COPY.banners.loading)).toBeInTheDocument();
    expect(
      screen.queryByText("Open or create a note to start editing."),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("notes-codemirror-host")).not.toBeInTheDocument();
  });

  it("deletes the active note from the vault when the user confirms", async () => {
    render(<NotesPageClient />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      screen
        .getByRole("button", { name: "More note actions" })
        .click();
    });

    await act(async () => {
      screen
        .getByRole("button", { name: NOTES_UI_COPY.headerActions.delete })
        ?.click();
    });

    const dialog = screen.getByRole("alertdialog");

    await act(async () => {
      within(dialog)
        .getByRole("button", { name: NOTES_UI_COPY.headerActions.delete })
        .click();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(
      screen.queryByRole("button", { name: "rhythm-drill.md" }),
    ).not.toBeInTheDocument();
  });
});
