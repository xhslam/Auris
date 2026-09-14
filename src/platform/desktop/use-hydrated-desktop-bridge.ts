"use client";

import { useEffect, useState } from "react";
import { getDesktopBridge, type DesktopBridge } from "@/platform/desktop/desktop-runtime";

type HydratedDesktopBridge = {
  desktopBridge: DesktopBridge | null;
  hasHydratedDesktopBridge: boolean;
};

let cachedDesktopBridge: DesktopBridge | null = null;
let hasResolvedDesktopBridge = false;

function readInitialHydratedDesktopBridgeState(): HydratedDesktopBridge {
  if (typeof window === "undefined" || !hasResolvedDesktopBridge) {
    return {
      desktopBridge: null,
      hasHydratedDesktopBridge: false,
    };
  }

  return {
    desktopBridge: cachedDesktopBridge,
    hasHydratedDesktopBridge: true,
  };
}

function cacheDesktopBridge(desktopBridge: DesktopBridge | null) {
  cachedDesktopBridge = desktopBridge;
  hasResolvedDesktopBridge = true;
}

export function useHydratedDesktopBridge(): HydratedDesktopBridge {
  const [state, setState] = useState<HydratedDesktopBridge>(() =>
    readInitialHydratedDesktopBridgeState(),
  );

  useEffect(() => {
    if (hasResolvedDesktopBridge) {
      setState({
        desktopBridge: cachedDesktopBridge,
        hasHydratedDesktopBridge: true,
      });
      return;
    }

    const desktopBridge = getDesktopBridge();
    cacheDesktopBridge(desktopBridge);
    setState({
      desktopBridge,
      hasHydratedDesktopBridge: true,
    });
  }, []);

  return state;
}

export function resetHydratedDesktopBridgeCacheForTests() {
  cachedDesktopBridge = null;
  hasResolvedDesktopBridge = false;
}
