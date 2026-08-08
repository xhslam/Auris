"use client";

import type { RefObject } from "react";

type AiDockProviderSurfaceProps = {
  isProviderView: boolean;
  providerHostRef: RefObject<HTMLDivElement | null>;
};

export function AiDockProviderSurface({
  isProviderView,
  providerHostRef,
}: AiDockProviderSurfaceProps) {
  if (!isProviderView) {
    return null;
  }

  return (
    <div className="desktop-ai-dock__provider-surface">
      <div
        className="desktop-ai-dock__provider-host"
        data-immersive={isProviderView ? "true" : "false"}
        data-testid="desktop-ai-dock-provider-host"
        ref={providerHostRef}
      />
    </div>
  );
}
