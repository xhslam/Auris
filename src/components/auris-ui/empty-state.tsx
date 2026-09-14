"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

/**
 * Auris generic empty state — centered art + restrained copy + optional CTA.
 * No third-party illustration assets; the default mark is an Auris-own SVG.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="auris-empty">
      <div aria-hidden="true" className="auris-empty__art">
        {icon ?? (
          <svg fill="none" height="64" viewBox="0 0 64 64" width="64">
            <rect
              height="40"
              rx="8"
              stroke="currentColor"
              strokeWidth="2.4"
              width="34"
              x="15"
              y="14"
            />
            <path
              d="M23 26h18M23 33h18M23 40h11"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.4"
            />
          </svg>
        )}
      </div>
      <h3 className="auris-empty__title">{title}</h3>
      {description ? <p className="auris-empty__desc">{description}</p> : null}
      {action}
    </div>
  );
}
