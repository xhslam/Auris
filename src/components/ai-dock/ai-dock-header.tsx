"use client";

import { AiProviderTabs } from "@/components/ai-dock/ai-provider-tabs";
import { DESKTOP_AI_DOCK_VIEW_LABELS } from "@/features/ai-dock/ai-dock-types";
import {
  DESKTOP_AI_DOCK_VIEWS,
  DESKTOP_AI_PROVIDER_IDS,
  type DesktopAiDockView,
  type DesktopAiProviderId,
} from "@/features/app-runtime/app-runtime.types";

type AiDockHeaderProps = {
  activeProvider: DesktopAiProviderId;
  activeView: DesktopAiDockView;
  isProviderView: boolean;
  onClose: () => void;
  onSelectProvider: (providerId: DesktopAiProviderId) => void;
  onSelectView: (viewId: DesktopAiDockView) => void;
};

function ViewTabs({
  activeView,
  compact = false,
  onSelectView,
}: {
  activeView: DesktopAiDockView;
  compact?: boolean;
  onSelectView: (viewId: DesktopAiDockView) => void;
}) {
  return (
    <div
      aria-label="AI views"
      className="desktop-ai-dock__view-tabs"
      data-compact={compact ? "true" : "false"}
      role="tablist"
    >
      {DESKTOP_AI_DOCK_VIEWS.map((viewId) => (
        <button
          aria-selected={activeView === viewId}
          className="desktop-ai-dock__view-tab"
          data-active={activeView === viewId ? "true" : "false"}
          key={viewId}
          onClick={() => onSelectView(viewId)}
          role="tab"
          type="button"
        >
          {DESKTOP_AI_DOCK_VIEW_LABELS[viewId]}
        </button>
      ))}
    </div>
  );
}

export function AiDockHeader({
  activeProvider,
  activeView,
  isProviderView,
  onClose,
  onSelectProvider,
  onSelectView,
}: AiDockHeaderProps) {
  if (isProviderView) {
    return (
      <div className="desktop-ai-dock__compact-toolbar">
        <div className="desktop-ai-dock__compact-toolbar-top">
          <ViewTabs activeView={activeView} compact onSelectView={onSelectView} />
          <button
            aria-label="Close AI sidebar"
            className="desktop-ai-dock__compact-action"
            onClick={onClose}
            type="button"
          >
            Hide
          </button>
        </div>
        <AiProviderTabs
          activeProvider={activeProvider}
          compact
          onSelectProvider={onSelectProvider}
          providerIds={[...DESKTOP_AI_PROVIDER_IDS]}
        />
      </div>
    );
  }

  return (
    <header className="desktop-ai-dock__header">
      <div>
        <p className="desktop-ai-dock__eyebrow">Desktop AI</p>
        <h2>{DESKTOP_AI_DOCK_VIEW_LABELS[activeView]}</h2>
      </div>
      <ViewTabs activeView={activeView} onSelectView={onSelectView} />
    </header>
  );
}
