"use client";

import { useCallback, useEffect, useState } from "react";
import type { DesktopAiDockView } from "@/features/app-runtime/app-runtime.types";
import type {
  DesktopAiPromptRecord,
  DesktopBridge,
} from "@/platform/desktop/desktop-bridge";

type UseAiDockPromptsInput = {
  activeView: DesktopAiDockView;
  desktopBridge: DesktopBridge | null;
};

export function useAiDockPrompts(input: UseAiDockPromptsInput) {
  const [promptRecords, setPromptRecords] = useState<DesktopAiPromptRecord[]>(
    [],
  );
  const [promptQuery, setPromptQuery] = useState("");
  const [isPromptLibraryLoading, setIsPromptLibraryLoading] = useState(false);

  const loadPromptLibrary = useCallback(
    async (query: string) => {
      if (!input.desktopBridge?.aiPrompts) {
        setPromptRecords([]);
        return;
      }

      setIsPromptLibraryLoading(true);

      try {
        const nextRecords = query.trim()
          ? await input.desktopBridge.aiPrompts.search(query)
          : await input.desktopBridge.aiPrompts.list();

        setPromptRecords(nextRecords);
      } finally {
        setIsPromptLibraryLoading(false);
      }
    },
    [input.desktopBridge],
  );

  useEffect(() => {
    if (input.activeView === "prompts") {
      void loadPromptLibrary(promptQuery);
    }
  }, [input.activeView, loadPromptLibrary, promptQuery]);

  const handleCopyPrompt = useCallback(async (record: DesktopAiPromptRecord) => {
    await navigator.clipboard?.writeText?.(record.content);
  }, []);

  const handleTogglePromptFavorite = useCallback(
    async (record: DesktopAiPromptRecord) => {
      if (!input.desktopBridge?.aiPrompts) {
        return;
      }

      await input.desktopBridge.aiPrompts.update(record.id, {
        isFavorite: !record.isFavorite,
      });
      await loadPromptLibrary(promptQuery);
    },
    [input.desktopBridge, loadPromptLibrary, promptQuery],
  );

  const handleImportDefaultPrompts = useCallback(async () => {
    if (!input.desktopBridge?.aiPrompts) {
      return;
    }

    await input.desktopBridge.aiPrompts.importDefaultLibrary();
    await loadPromptLibrary(promptQuery);
  }, [input.desktopBridge, loadPromptLibrary, promptQuery]);

  const handleExportPrompts = useCallback(async () => {
    if (!input.desktopBridge?.aiPrompts) {
      return;
    }

    const payload = await input.desktopBridge.aiPrompts.export();
    await input.desktopBridge.downloads.exportJson(
      "shadowing-ai-prompts.json",
      payload,
    );
  }, [input.desktopBridge]);

  return {
    handleCopyPrompt,
    handleExportPrompts,
    handleImportDefaultPrompts,
    handleTogglePromptFavorite,
    isPromptLibraryLoading,
    promptQuery,
    promptRecords,
    setPromptQuery,
  };
}
