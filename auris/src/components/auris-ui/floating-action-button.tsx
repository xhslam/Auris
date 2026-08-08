"use client";

import type { ReactNode } from "react";

type FloatingActionButtonProps = {
  ariaLabel: string;
  onClick?: () => void;
  children?: ReactNode;
};

/**
 * Auris FAB — fixed bottom-right round button filled with the Sunset gradient.
 * Used on list-type pages (notes grid, flash, etc.).
 */
export function FloatingActionButton({
  ariaLabel,
  onClick,
  children,
}: FloatingActionButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className="auris-fab"
      onClick={onClick}
      type="button"
    >
      {children ?? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M12 5v14M5 12h14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
