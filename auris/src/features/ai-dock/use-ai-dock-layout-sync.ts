"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH,
  clampDesktopAiDockWidth,
  getDesktopAiDockShellWidth,
} from "@/features/ai-dock/ai-dock-layout";
import type {
  DesktopAiDockView,
  DesktopAiProviderId,
} from "@/features/app-runtime/app-runtime.types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

type AiDockBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type AiDockState = {
  activeProvider: DesktopAiProviderId;
  activeView: DesktopAiDockView;
  isOpen: boolean;
  panelWidth: number;
};

type UseAiDockLayoutSyncInput = {
  aiDockBridge: DesktopBridge["aiDock"] | null;
  dockState: AiDockState;
  isDockVisible: boolean;
  onPanelWidthChange: (panelWidth: number) => void;
};

function measureBounds(element: HTMLElement | null): AiDockBounds | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    x: Math.round(rect.left),
    y: Math.round(rect.top),
  };
}

export function useAiDockLayoutSync(input: UseAiDockLayoutSyncInput) {
  const { aiDockBridge, dockState, isDockVisible, onPanelWidthChange } = input;
  const surfaceRef = useRef<HTMLElement | null>(null);
  const providerHostRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(() =>
    typeof window === "undefined"
      ? DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH
      : window.innerWidth || DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const parentElement =
      surfaceRef.current?.closest(".desktop-app-frame__layout") ??
      surfaceRef.current?.parentElement;

    if (!parentElement) {
      return;
    }

    const updateLayoutWidth = () => {
      const nextWidth =
        parentElement.clientWidth ||
        window.innerWidth ||
        DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH;

      if (nextWidth > 0) {
        setLayoutWidth(nextWidth);
      }
    };

    updateLayoutWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayoutWidth);
      return () => {
        window.removeEventListener("resize", updateLayoutWidth);
      };
    }

    const observer = new ResizeObserver(() => updateLayoutWidth());
    observer.observe(parentElement);

    return () => observer.disconnect();
  }, []);

  const resolvedPanelWidth = useMemo(
    () => clampDesktopAiDockWidth(dockState.panelWidth, layoutWidth),
    [dockState.panelWidth, layoutWidth],
  );
  const shellWidth = useMemo(
    () =>
      getDesktopAiDockShellWidth(
        dockState.isOpen,
        resolvedPanelWidth,
        layoutWidth,
      ),
    [dockState.isOpen, layoutWidth, resolvedPanelWidth],
  );
  const reservedLayoutWidth = dockState.isOpen ? shellWidth : 0;

  const syncDockLayout = useCallback(
    (nextDockState: AiDockState) => {
      if (!aiDockBridge) {
        return;
      }

      void aiDockBridge.syncLayout({
        activeProvider: nextDockState.activeProvider,
        activeView: nextDockState.activeView,
        bounds:
          isDockVisible &&
          nextDockState.isOpen &&
          nextDockState.activeView === "provider"
            ? measureBounds(providerHostRef.current)
            : null,
        isOpen: nextDockState.isOpen,
        panelWidth: clampDesktopAiDockWidth(nextDockState.panelWidth, layoutWidth),
      });
    },
    [aiDockBridge, isDockVisible, layoutWidth],
  );

  useEffect(() => {
    syncDockLayout(dockState);
  }, [dockState, isDockVisible, syncDockLayout]);

  const updatePanelWidth = useCallback(
    (nextWidth: number) => {
      onPanelWidthChange(clampDesktopAiDockWidth(nextWidth, layoutWidth));
    },
    [layoutWidth, onPanelWidthChange],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      updatePanelWidth(dragState.startWidth + (dragState.startX - event.clientX));
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current) {
        return;
      }

      dragStateRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [updatePanelWidth]);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      dragStateRef.current = {
        startWidth: resolvedPanelWidth,
        startX: clientX,
      };
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [resolvedPanelWidth],
  );

  const handleResizeByStep = useCallback(
    (delta: number) => {
      updatePanelWidth(resolvedPanelWidth + delta);
    },
    [resolvedPanelWidth, updatePanelWidth],
  );

  return {
    handleResizeByStep,
    handleResizeStart,
    isResizing,
    providerHostRef,
    reservedLayoutWidth,
    resolvedPanelWidth,
    shellWidth,
    surfaceRef,
  };
}
