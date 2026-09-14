"use client";

import type { DesktopShowcaseCard } from "@/components/desktop/desktop-shell-fixtures";

type DesktopShowcaseCardProps = {
  compact?: boolean;
  item: DesktopShowcaseCard;
};

export function DesktopShowcaseCard({
  compact = false,
  item,
}: DesktopShowcaseCardProps) {
  return (
    <article
      className="desktop-showcase-card"
      data-compact={compact ? "true" : "false"}
      data-tone={item.tone}
    >
      <div className="desktop-showcase-card__visual" style={{ background: item.accent }}>
        {item.locale ? <span className="desktop-showcase-card__locale">{item.locale}</span> : null}
        {item.tone === "audio" ? (
          <div className="desktop-showcase-card__wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {item.tone === "cover" ? (
          <div className="desktop-showcase-card__cover-copy" aria-hidden="true">
            {item.subtitle ? <span>{item.subtitle}</span> : null}
          </div>
        ) : null}
        {item.tone === "video" ? (
          <div className="desktop-showcase-card__video-chip" aria-hidden="true">
            Play
          </div>
        ) : null}
        {item.tone === "document" ? (
          <div className="desktop-showcase-card__document-chip" aria-hidden="true">
            MD
          </div>
        ) : null}
      </div>
      <div className="desktop-showcase-card__copy">
        <strong>{item.title}</strong>
        {item.note ? <span>{item.note}</span> : null}
      </div>
    </article>
  );
}
