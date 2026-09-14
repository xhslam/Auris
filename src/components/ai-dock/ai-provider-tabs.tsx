"use client";

import {
  DESKTOP_AI_PROVIDER_LABELS,
} from "@/features/ai-dock/ai-dock-types";
import type { DesktopAiProviderId } from "@/features/app-runtime/app-runtime.types";

type AiProviderTabsProps = {
  activeProvider: DesktopAiProviderId;
  compact?: boolean;
  onSelectProvider: (providerId: DesktopAiProviderId) => void;
  providerIds: DesktopAiProviderId[];
};

function AiProviderIcon({ providerId }: { providerId: DesktopAiProviderId }) {
  const commonProps = {
    "aria-hidden": true,
    className: `desktop-ai-dock__provider-icon desktop-ai-dock__provider-icon--${providerId}`,
    focusable: false,
    viewBox: "0 0 32 32",
  } as const;

  switch (providerId) {
    case "chatgpt":
      return (
        <svg {...commonProps}>
          <rect className="desktop-ai-dock__provider-icon-tile" height="28" rx="8" width="28" x="2" y="2" />
          <path className="desktop-ai-dock__provider-icon-stroke" d="M15.8 6.4c2.6 0 4.1 1.5 4.2 3.8 2.1.8 3.1 2.7 2.4 4.9 1.1 2  .5 4.3-1.5 5.6-.4 2.3-2.1 3.8-4.6 3.6-1.7 1.6-4.1 1.6-5.8.1-2.3.2-4.1-1.1-4.8-3.3-1.8-1.2-2.4-3.5-1.4-5.5-.7-2.2.4-4.2 2.6-5  .1-2.3 1.8-3.8 4.1-3.8 1.3-1.1 3.2-1.2 4.8-.4Z" />
          <path className="desktop-ai-dock__provider-icon-stroke" d="m10.4 10 5.9-3.4M16.2 6.6l5.6 3.5M21.9 10.3v6.5M21.8 16.7l-5.6 3.5M16.1 20.2l-5.8-3.4M10.2 16.8v-6.6" />
          <path className="desktop-ai-dock__provider-icon-stroke" d="m10.3 10.2 5.8 3.3 5.8-3.2M10.2 16.8l5.9-3.3v6.7" />
        </svg>
      );
    case "gemini":
      return (
        <svg {...commonProps}>
          <rect className="desktop-ai-dock__provider-icon-tile" height="28" rx="8" width="28" x="2" y="2" />
          <path className="desktop-ai-dock__provider-icon-gemini-green" d="M16 6.2 21 16 16 25.8 11 16Z" />
          <path className="desktop-ai-dock__provider-icon-gemini-blue" d="M6.2 16 16 6.2 21 16 16 17.6Z" />
          <path className="desktop-ai-dock__provider-icon-gemini-yellow" d="M6.2 16 16 14.4 25.8 16 16 25.8Z" />
          <path className="desktop-ai-dock__provider-icon-gemini-red" d="M16 6.2 25.8 16 16 17.6Z" />
        </svg>
      );
    case "google":
      return (
        <svg {...commonProps}>
          <rect className="desktop-ai-dock__provider-icon-tile" height="28" rx="8" width="28" x="2" y="2" />
          <path className="desktop-ai-dock__provider-icon-google-blue" d="M25.4 16.2c0-.8-.1-1.6-.2-2.3H16v4.4h5.2c-.2 1.3-.9 2.4-1.9 3.1v2.8h3.6c2.1-1.9 2.5-4.8 2.5-8Z" />
          <path className="desktop-ai-dock__provider-icon-google-green" d="M16 25.7c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H6.2v2.9c1.8 3.6 5.5 6.1 9.8 6.1Z" />
          <path className="desktop-ai-dock__provider-icon-google-yellow" d="M9.9 16.7c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V9.4H6.2c-.8 1.5-1.2 3.2-1.2 5.1s.4 3.6 1.2 5.1Z" />
          <path className="desktop-ai-dock__provider-icon-google-red" d="M16 7.8c1.6 0 3 .6 4.2 1.6l3.1-3.1C21.5 4.6 19 3.5 16 3.5c-4.3 0-8 2.5-9.8 6.1l3.7 2.9c.9-2.7 3.3-4.7 6.1-4.7Z" />
        </svg>
      );
    case "deepseek":
      return (
        <svg {...commonProps}>
          <rect className="desktop-ai-dock__provider-icon-tile" height="28" rx="8" width="28" x="2" y="2" />
          <path className="desktop-ai-dock__provider-icon-whale" d="M5.3 15.1c.4-4.8 4.3-7.9 9.5-7.9 2.7 0 5 .8 6.9 2.2.6-1.8 1.8-3.3 3.6-4.5.5 2.2.1 4.2-1 5.9 1.8-.2 3.3.2 4.4 1.3-1.5 1.4-3.3 2.1-5.3 2.1-.8 5-4.9 8.4-10.1 8.4-4.8 0-8-2.9-8-7.5Z" />
          <path className="desktop-ai-dock__provider-icon-whale-belly" d="M7.2 12.6c1.9 2.7 4.1 4.8 7.4 6-2.7 1.3-5.4 1-7.1-.7-1.4-1.4-1.5-3.4-.3-5.3Z" />
          <circle className="desktop-ai-dock__provider-icon-whale-eye" cx="19.3" cy="12.8" r="1" />
        </svg>
      );
  }
}

export function AiProviderTabs({
  activeProvider,
  compact = false,
  onSelectProvider,
  providerIds,
}: AiProviderTabsProps) {
  return (
    <div
      aria-label="AI providers"
      className="desktop-ai-dock__provider-tabs"
      data-compact={compact ? "true" : "false"}
      role="tablist"
    >
      {providerIds.map((providerId) => (
        <button
          aria-selected={activeProvider === providerId}
          aria-label={DESKTOP_AI_PROVIDER_LABELS[providerId]}
          className="desktop-ai-dock__provider-tab"
          data-active={activeProvider === providerId ? "true" : "false"}
          data-provider={providerId}
          key={providerId}
          onClick={() => onSelectProvider(providerId)}
          role="tab"
          title={DESKTOP_AI_PROVIDER_LABELS[providerId]}
          type="button"
        >
          {compact ? (
            <AiProviderIcon providerId={providerId} />
          ) : (
            DESKTOP_AI_PROVIDER_LABELS[providerId]
          )}
        </button>
      ))}
    </div>
  );
}
