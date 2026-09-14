"use client";

import { useCallback, useEffect, useState } from "react";
import { AiChatHistoryPanel } from "@/components/ai-dock/ai-chat-history-panel";
import { AiDockHeader } from "@/components/ai-dock/ai-dock-header";
import { DesktopAiDockLayout } from "@/components/ai-dock/ai-dock-layout";
import { AiPromptLibraryPanel } from "@/components/ai-dock/ai-prompt-library-panel";
import { AiDockProviderSurface } from "@/components/ai-dock/ai-dock-provider-surface";
import { useAiDockHistory } from "@/features/ai-dock/use-ai-dock-history";
import { useAiDockLayoutSync } from "@/features/ai-dock/use-ai-dock-layout-sync";
import { useAiDockPrompts } from "@/features/ai-dock/use-ai-dock-prompts";
import {
  DESKTOP_AI_DOCK_REVEAL_ZONE_PX,
  useAiDockVisibility,
} from "@/features/ai-dock/use-ai-dock-visibility";
import { readDesktopAiDockState } from "@/features/ai-dock/ai-dock-storage";
import {
  type DesktopAiDockView,
  type DesktopAiProviderId,
} from "@/features/app-runtime/app-runtime.types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

type DesktopAiDockShellProps = {
  desktopBridge: DesktopBridge | null;
};

const AI_DOCK_INTENT_QUERIES: Record<string, string> = {
  explain: "理解文章",
  review: "复习问题",
  summary: "总结笔记",
};

function getRouteAiDockState():
  | { activeView: DesktopAiDockView; promptQuery: string | null }
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const aiDockView = params.get("aiDock");

  if (
    aiDockView !== "provider" &&
    aiDockView !== "prompts" &&
    aiDockView !== "history"
  ) {
    return null;
  }

  const intent = params.get("intent") ?? "";

  return {
    activeView: aiDockView,
    promptQuery: aiDockView === "prompts" ? (AI_DOCK_INTENT_QUERIES[intent] ?? "") : null,
  };
}

export function DesktopAiDockShell({ desktopBridge }: DesktopAiDockShellProps) {
  const [dockState, setDockState] = useState(() => readDesktopAiDockState(null));

  const aiDockBridge = desktopBridge?.aiDock ?? null;
  const isProviderView = dockState.activeView === "provider";
  const {
    handleDockBlurCapture,
    handleDockFocusCapture,
    isDockVisible,
    revealDock,
    scheduleHideDock,
  } = useAiDockVisibility({
    isOpen: dockState.isOpen,
  });
  const {
    handleResizeByStep,
    handleResizeStart,
    isResizing,
    providerHostRef,
    reservedLayoutWidth,
    shellWidth,
    surfaceRef,
  } = useAiDockLayoutSync({
    aiDockBridge,
    dockState,
    isDockVisible,
    onPanelWidthChange: (panelWidth) =>
      setDockState((current) => ({
        ...current,
        panelWidth,
      })),
  });
  const {
    handleCopyPrompt,
    handleExportPrompts,
    handleImportDefaultPrompts,
    handleTogglePromptFavorite,
    isPromptLibraryLoading,
    promptQuery,
    promptRecords,
    setPromptQuery,
  } = useAiDockPrompts({
    activeView: dockState.activeView,
    desktopBridge,
  });
  const {
    handleCaptureCurrentConversation,
    handleExportHistory,
    handleToggleHistoryFavorite,
    historyQuery,
    historyRecords,
    isHistoryLoading,
    selectedHistoryId,
    setHistoryQuery,
    setSelectedHistoryId,
  } = useAiDockHistory({
    activeProvider: dockState.activeProvider,
    activeView: dockState.activeView,
    desktopBridge,
  });

  useEffect(() => {
    if (!desktopBridge) {
      return;
    }

    let isCancelled = false;

    void desktopBridge.runtimeState.get().then((runtimeState) => {
      if (isCancelled) {
        return;
      }

      const routeState = getRouteAiDockState();
      const nextDockState = readDesktopAiDockState(runtimeState);

      setDockState(
        routeState
          ? {
              ...nextDockState,
              activeView: routeState.activeView,
              isOpen: true,
            }
          : nextDockState,
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [desktopBridge]);

  const setDockVisibility = useCallback(
    (isOpen: boolean) => {
      setDockState((current) => ({
        ...current,
        isOpen,
      }));

      if (isOpen) {
        revealDock();
      }
    },
    [revealDock],
  );

  const setActiveView = useCallback((activeView: DesktopAiDockView) => {
    setDockState((current) => ({
      ...current,
      activeView,
      isOpen: true,
    }));
  }, []);

  const setActiveProvider = useCallback(
    (activeProvider: DesktopAiProviderId) => {
      setDockState((current) => ({
        ...current,
        activeProvider,
      }));
    },
    [],
  );

  useEffect(() => {
    const routeState = getRouteAiDockState();

    if (!routeState) {
      return;
    }

    setDockState((current) => ({
      ...current,
      activeView: routeState.activeView,
      isOpen: true,
    }));

    if (routeState.promptQuery !== null) {
      setPromptQuery(routeState.promptQuery);
    }
  }, [setPromptQuery]);

  return (
    <div
      className="desktop-ai-dock__layout-spacer"
      data-reserved={dockState.isOpen && aiDockBridge ? "true" : "false"}
      data-testid="desktop-ai-dock-layout-spacer"
      style={{
        minWidth: `${reservedLayoutWidth}px`,
        width: `${reservedLayoutWidth}px`,
      }}
    >
      <div
        aria-hidden="true"
        className="desktop-ai-dock__reveal-zone"
        data-testid="desktop-ai-dock-reveal-zone"
        onMouseEnter={revealDock}
        onMouseLeave={scheduleHideDock}
        style={{ width: `${DESKTOP_AI_DOCK_REVEAL_ZONE_PX}px` }}
      />

      {!aiDockBridge ? null : (<>

      <DesktopAiDockLayout
        isOpen={dockState.isOpen}
        isResizing={isResizing}
        isVisible={isDockVisible}
        onBlurCapture={handleDockBlurCapture}
        onFocusCapture={handleDockFocusCapture}
        onMouseEnter={revealDock}
        onMouseLeave={scheduleHideDock}
        onResizeByStep={handleResizeByStep}
        onResizeStart={handleResizeStart}
        onToggleOpen={() => setDockVisibility(!dockState.isOpen)}
        shellWidth={shellWidth}
      >
        <section
          className="desktop-ai-dock__surface"
          data-view={dockState.activeView}
          ref={surfaceRef}
        >
          <AiDockHeader
            activeProvider={dockState.activeProvider}
            activeView={dockState.activeView}
            isProviderView={isProviderView}
            onClose={() => setDockVisibility(false)}
            onSelectProvider={setActiveProvider}
            onSelectView={setActiveView}
          />

          <div className="desktop-ai-dock__body">
            <AiDockProviderSurface
              isProviderView={isProviderView}
              providerHostRef={providerHostRef}
            />

            {dockState.activeView === "prompts" ? (
              <AiPromptLibraryPanel
                isLoading={isPromptLibraryLoading}
                onCopyPrompt={handleCopyPrompt}
                onExportLibrary={handleExportPrompts}
                onImportDefaults={handleImportDefaultPrompts}
                onQueryChange={setPromptQuery}
                onToggleFavorite={handleTogglePromptFavorite}
                promptRecords={promptRecords}
                query={promptQuery}
              />
            ) : null}

            {dockState.activeView === "history" ? (
              <AiChatHistoryPanel
                historyRecords={historyRecords}
                isLoading={isHistoryLoading}
                onCaptureConversation={handleCaptureCurrentConversation}
                onExportHistory={handleExportHistory}
                onQueryChange={setHistoryQuery}
                onSelectRecord={setSelectedHistoryId}
                onToggleFavorite={handleToggleHistoryFavorite}
                query={historyQuery}
                selectedRecordId={selectedHistoryId}
              />
            ) : null}
          </div>
        </section>
      </DesktopAiDockLayout>
      </>)}
    </div>
  );
}
