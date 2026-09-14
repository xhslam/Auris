"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DesktopAiDockView,
  DesktopAiProviderId,
} from "@/features/app-runtime/app-runtime.types";
import type {
  DesktopAiHistoryRecord,
  DesktopBridge,
} from "@/platform/desktop/desktop-bridge";

type UseAiDockHistoryInput = {
  activeProvider: DesktopAiProviderId;
  activeView: DesktopAiDockView;
  desktopBridge: DesktopBridge | null;
};

function sameHistorySelection(
  records: DesktopAiHistoryRecord[],
  selectedHistoryId: number | null,
) {
  return (
    selectedHistoryId !== null &&
    records.some((record) => record.id === selectedHistoryId)
  );
}

export function useAiDockHistory(input: UseAiDockHistoryInput) {
  const [historyRecords, setHistoryRecords] = useState<DesktopAiHistoryRecord[]>(
    [],
  );
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(
    null,
  );
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const loadChatHistory = useCallback(
    async (query: string) => {
      if (!input.desktopBridge?.aiHistory) {
        setHistoryRecords([]);
        return;
      }

      setIsHistoryLoading(true);

      try {
        const nextRecords = query.trim()
          ? await input.desktopBridge.aiHistory.search(query)
          : await input.desktopBridge.aiHistory.list();

        setHistoryRecords(nextRecords);
        setSelectedHistoryId((current) => {
          if (sameHistorySelection(nextRecords, current)) {
            return current;
          }

          return nextRecords[0]?.id ?? null;
        });
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [input.desktopBridge],
  );

  useEffect(() => {
    if (input.activeView === "history") {
      void loadChatHistory(historyQuery);
    }
  }, [historyQuery, input.activeView, loadChatHistory]);

  const handleToggleHistoryFavorite = useCallback(
    async (record: DesktopAiHistoryRecord) => {
      if (!input.desktopBridge?.aiHistory) {
        return;
      }

      await input.desktopBridge.aiHistory.toggleFavorite(record.id);
      await loadChatHistory(historyQuery);
    },
    [historyQuery, input.desktopBridge, loadChatHistory],
  );

  const handleExportHistory = useCallback(async () => {
    if (!input.desktopBridge?.aiHistory) {
      return;
    }

    const payload = await input.desktopBridge.aiHistory.export();
    await input.desktopBridge.downloads.exportJson(
      "shadowing-ai-history.json",
      payload,
    );
  }, [input.desktopBridge]);

  const handleCaptureCurrentConversation = useCallback(async () => {
    if (!input.desktopBridge?.aiHistory) {
      return;
    }

    const nextRecord =
      await input.desktopBridge.aiHistory.captureCurrentConversation(
        input.activeProvider,
      );

    await loadChatHistory(historyQuery);

    if (nextRecord?.id) {
      setSelectedHistoryId(nextRecord.id);
    }
  }, [historyQuery, input.activeProvider, input.desktopBridge, loadChatHistory]);

  return {
    handleCaptureCurrentConversation,
    handleExportHistory,
    handleToggleHistoryFavorite,
    historyQuery,
    historyRecords,
    isHistoryLoading,
    selectedHistoryId,
    setHistoryQuery,
    setSelectedHistoryId,
  };
}
