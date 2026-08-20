import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceLearningMemory } from "@/features/learning-memory/use-workspace-learning-memory";
import type { NotePage, NotesStorage } from "@/features/notes/note-types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

describe("useWorkspaceLearningMemory", () => {
  it("saves the current learning context into the desktop AI prompt library", async () => {
    const savePrompt = vi.fn(async (record) => ({
      category: record.category ?? "Learning Memory",
      content: record.content ?? "",
      id: 1,
      isFavorite: false,
      lastUsed: null,
      tags: record.tags ?? [],
      title: record.title ?? "Untitled",
      useCount: 0,
      variables: [],
    }));
    const desktopBridge = {
      aiPrompts: {
        save: savePrompt,
      },
    } as unknown as DesktopBridge;

    const { result } = renderHook(() =>
      useWorkspaceLearningMemory({
        desktopBridge,
        notesStorage: null,
        sentences: [],
        sourceNotePath: "Learning/rhythm-review.md",
        sourceText: "Natural rhythm matters when speaking clearly.",
        title: "Rhythm Drill",
        words: [],
      }),
    );

    await act(async () => {
      await result.current.sendAiContextToDock();
    });

    expect(savePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "Learning Memory",
        content: expect.stringContaining("Title: Rhythm Drill"),
        tags: ["learning-memory", "shadowing"],
        title: "Learning Memory: Rhythm Drill",
        variables: [],
      }),
    );
    expect(savePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "Source note: [[Learning/rhythm-review.md]]",
        ),
      }),
    );
    await waitFor(() => {
      expect(result.current.statusMessage).toBe(
        "AI context saved to the AI Dock prompt library.",
      );
    });
  });

  it("pins the current material and source note when creating a learning note", async () => {
    const sourcePage: NotePage = {
      blocks: [],
      fileName: "rhythm.md",
      frontmatter: {},
      icon: "N",
      id: "source-note",
      markdownBody: "# Rhythm source\n\nOriginal explanation.",
      relativePath: "Sources/rhythm.md",
      title: "Rhythm source",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };
    const createdPage: NotePage = {
      blocks: [],
      fileName: "rhythm-drill.md",
      frontmatter: {},
      icon: "N",
      id: "new-note",
      markdownBody: "",
      relativePath: "Learning/rhythm-drill.md",
      title: "Rhythm Drill",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const savePage = vi.fn(async (page: NotePage) => page);
    const notesStorage = {
      createPage: vi.fn(async () => createdPage),
      getPage: vi.fn(async (id: string) => id === sourcePage.id ? sourcePage : null),
      listPages: vi.fn(async () => [{
        fileName: sourcePage.fileName,
        icon: sourcePage.icon,
        id: sourcePage.id,
        relativePath: sourcePage.relativePath,
        title: sourcePage.title,
        updatedAt: sourcePage.updatedAt,
      }]),
      savePage,
    } as unknown as NotesStorage;

    const { result } = renderHook(() =>
      useWorkspaceLearningMemory({
        notesStorage,
        sentences: [],
        sourceNotePath: sourcePage.relativePath,
        sourceText: "Natural rhythm matters when speaking clearly.",
        title: "Rhythm Drill",
        words: [],
      }),
    );

    await waitFor(() => expect(notesStorage.listPages).toHaveBeenCalled());
    await act(async () => {
      await result.current.createLearningNote();
    });

    expect(savePage).toHaveBeenCalledWith(expect.objectContaining({
      frontmatter: expect.objectContaining({
        aurisDependencySnapshot: expect.objectContaining({
          status: "current",
        }),
      }),
      markdownBody: expect.stringContaining("## Dependency Review"),
    }));
    expect(savePage).toHaveBeenCalledWith(expect.objectContaining({
      markdownBody: expect.stringContaining("- Status: current"),
    }));
    expect(savePage).toHaveBeenCalledWith(expect.objectContaining({
      markdownBody: expect.stringContaining("- source-note: [[Sources/rhythm.md]]"),
    }));
  });
});
