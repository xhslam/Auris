import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceLearningMemory } from "@/features/learning-memory/use-workspace-learning-memory";
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
});
