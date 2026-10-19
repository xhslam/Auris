"use client";

import {
  useCallback,
  useEffect,
  startTransition,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEvent,
  type MouseEventHandler,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";


import {
  DESKTOP_NAV_ITEMS,
  type DesktopNavItem,
  type DesktopNavGroupId,
} from "@/components/desktop/desktop-shell-fixtures";
import { DesktopNotesVaultNav } from "@/components/desktop/desktop-notes-vault-nav";
import { createNotesRootNavigateEvent } from "@/components/notes-v2/notes-navigation";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";
import "@/components/auris-ui/auris-ui.css";

type DesktopAppSidebarProps = {
  activeNavId?: string;
  activeWorkspace: AppWorkspaceId;
  isVisible: boolean;
  onNavigate?: () => void;
  onBlurCapture?: FocusEventHandler<HTMLElement>;
  onFocusCapture?: FocusEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  isPersistentRail?: boolean;
};

const NAV_GROUP_ORDER: DesktopNavGroupId[] = ["primary", "library", "tools"];
const PREFETCHED_NAVIGATION_COMMIT_DELAY_MS = 0;
const FALLBACK_NAVIGATION_COMMIT_DELAY_MS = 32;
const NOTES_VAULT_OPEN_SESSION_KEY = "auris.desktop.notes-vault-open";

function readNotesVaultOpen() {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(NOTES_VAULT_OPEN_SESSION_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function writeNotesVaultOpen(isOpen: boolean) {
  try {
    window.sessionStorage.setItem(
      NOTES_VAULT_OPEN_SESSION_KEY,
      isOpen ? "true" : "false",
    );
  } catch {
    // Session state remains available when storage is unavailable.
  }
}

function getGroupItems(group: DesktopNavGroupId) {
  return DESKTOP_NAV_ITEMS.filter((item) => item.group === group);
}

function shouldUseNativeLinkBehavior(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function NavGlyph({ itemId }: { itemId: DesktopNavItem["id"] }) {
  switch (itemId) {
    case "video":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M6 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="m16 11 4-2.5v7L16 13"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "reading":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11a2.5 2.5 0 0 0-2.5-2.5H5V5.5Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M19 5.5h-5A2.5 2.5 0 0 0 11.5 8v8.5H19v-11Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M7.5 9h2.4M7.5 12h2.4M15 9h1.8M15 12h1.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "nia":
    case "assistant":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 4.5 13.8 9l4.7.4-3.6 3 1.2 4.6-4.1-2.5-4.1 2.5 1.2-4.6-3.6-3L10.2 9 12 4.5Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "notes":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M7 5h10a2 2 0 0 1 2 2v10l-3-2.2L13 17l-3-2.2L7 17V7a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "flash":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M13 4 6 13.5h5L11 20l7-9.5h-5L13 4Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "review":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.5h-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "settings":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <circle
            cx="12"
            cy="12"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    default:
      return null;
  }
}

type DesktopSidebarLinkProps = {
  isActive: boolean;
  isExpanded?: boolean;
  item: DesktopNavItem;
  onActiveClick?: () => void;
  onBeforeNavigate?: () => void;
  onNavigate?: () => void;
};

function DesktopSidebarLink({
  isActive,
  isExpanded,
  item,
  onActiveClick,
  onBeforeNavigate,
  onNavigate,
}: DesktopSidebarLinkProps) {
  const router = useRouter();
  const hasCommittedNavigationRef = useRef(false);
  const hasPrefetchedRouteRef = useRef(false);
  const navigationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current !== null) {
        window.clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    hasCommittedNavigationRef.current = false;
  }, [isActive]);

  function prefetchRoute() {
    if (hasPrefetchedRouteRef.current) {
      return;
    }

    router.prefetch(item.href);
    hasPrefetchedRouteRef.current = true;
  }

  function handleMouseEnter() {
    prefetchRoute();
  }

  function handleFocus() {
    prefetchRoute();
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (shouldUseNativeLinkBehavior(event)) {
      return;
    }

    if (isActive && onActiveClick) {
      event.preventDefault();
      onActiveClick();
      return;
    }

    event.preventDefault();
    onBeforeNavigate?.();
    const hadPrefetchedRoute = hasPrefetchedRouteRef.current;
    prefetchRoute();

    if (
      isActive ||
      hasCommittedNavigationRef.current ||
      navigationTimeoutRef.current !== null
    ) {
      return;
    }

    navigationTimeoutRef.current = window.setTimeout(
      () => {
        hasCommittedNavigationRef.current = true;
        startTransition(() => {
          onNavigate?.();
          router.push(item.href);
        });
        navigationTimeoutRef.current = null;
      },
      hadPrefetchedRoute
        ? PREFETCHED_NAVIGATION_COMMIT_DELAY_MS
        : FALLBACK_NAVIGATION_COMMIT_DELAY_MS,
    );
  }

  return (
    <Link
      aria-label={item.label}
      aria-expanded={isExpanded}
      className="desktop-app-sidebar__link"
      data-active={isActive ? "true" : "false"}
      href={item.href}
      onClick={handleClick}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      title={item.label}
    >
      <span className="desktop-app-sidebar__link-leading">
        <span className="desktop-app-sidebar__link-mark" aria-hidden="true">
          <NavGlyph itemId={item.id} />
        </span>
        <span className="desktop-app-sidebar__link-text">{item.label}</span>
      </span>
      <span className="sr-only">{item.label}</span>
    </Link>
  );
}

export function DesktopAppSidebar({
  activeNavId,
  activeWorkspace,
  isVisible,
  onNavigate,
  onBlurCapture,
  onFocusCapture,
  onMouseEnter,
  onMouseLeave,
  isPersistentRail = false,
}: DesktopAppSidebarProps) {
  const resolvedActiveId = activeNavId ?? (activeWorkspace === "home" ? "review" : activeWorkspace);
  const [isNotesVaultOpen, setIsNotesVaultOpen] = useState(readNotesVaultOpen);
  const toggleNotesVaultOpen = useCallback(() => {
    setIsNotesVaultOpen((current) => {
      const next = !current;
      writeNotesVaultOpen(next);
      return next;
    });
  }, []);
  const handleNotesRootNavigate = useCallback(() => {
    window.dispatchEvent(createNotesRootNavigateEvent());
    setIsNotesVaultOpen(true);
    writeNotesVaultOpen(true);
  }, []);
  const showNotesVaultNav =
    resolvedActiveId === "notes" && isNotesVaultOpen;

  return (
    <aside
      aria-label="App navigation"
      aria-hidden={isVisible || isPersistentRail ? undefined : true}
      className="desktop-app-sidebar"
      data-visible={isVisible ? "true" : "false"}
      onBlurCapture={onBlurCapture}
      onFocusCapture={onFocusCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="desktop-app-sidebar__brand">
        <div className="desktop-app-sidebar__brand-main">
          <svg
            aria-label="Auris"
            role="img"
            className="desktop-app-sidebar__brand-pixel"
            viewBox="0 0 10 10"
            shapeRendering="crispEdges"
          >
            <path
              fill="currentColor"
              d="M4 1h2v1H4zM3 2h1v1H3zM6 2h1v1H6zM2 3h1v2H2zM7 3h1v2H7zM1 5h8v1H1zM1 6h1v2H1zM8 6h1v2H8zM0 8h2v1H0zM8 8h2v1H8z"
            />
            <path
              className="desktop-app-sidebar__brand-pixel-highlight"
              d="M4 1h2v1H4zM3 2h1v1H3zM2 3h1v2H2z"
            />
          </svg>
        </div>
      </div>
      <div className="desktop-app-sidebar__sections">
        {(isPersistentRail
          ? NAV_GROUP_ORDER.filter((group) => group !== "tools")
          : NAV_GROUP_ORDER
        ).map((group) =>
          renderNavGroup(group, resolvedActiveId, onNavigate, {
            notesVaultOpen: showNotesVaultNav,
            onNotesVaultNavigate: handleNotesRootNavigate,
            onNotesVaultToggle: toggleNotesVaultOpen,
          }),
        )}

        {isPersistentRail
          ? renderNavGroup("tools", resolvedActiveId, onNavigate)
          : null}
      </div>
    </aside>
  );
}

function renderNavGroup(
  group: DesktopNavGroupId,
  resolvedActiveId: string,
  onNavigate?: () => void,
  options: {
    notesVaultOpen?: boolean;
    onNotesVaultNavigate?: () => void;
    onNotesVaultToggle?: () => void;
  } = {},
) {
  const items = getGroupItems(group);

  return (
    <section
      className="desktop-app-sidebar__group"
      data-group={group}
      key={group}
    >
      <nav
        aria-label={`${group} navigation`}
        className="desktop-app-sidebar__nav"
      >
        {items.map((item) => {
          return (
            <div className="desktop-app-sidebar__nav-entry" key={item.id}>
              <DesktopSidebarLink
                isActive={item.id === resolvedActiveId}
                item={item}
                isExpanded={item.id === "notes" ? Boolean(options.notesVaultOpen) : undefined}
                onActiveClick={
                  item.id === "notes" ? options.onNotesVaultToggle : undefined
                }
                onBeforeNavigate={
                  item.id === "notes" ? options.onNotesVaultNavigate : undefined
                }
                onNavigate={onNavigate}
              />
              {item.id === "notes" && resolvedActiveId === "notes" ? (
                <div
                  aria-hidden={!options.notesVaultOpen}
                  inert={!options.notesVaultOpen}
                  className="desktop-notes-vault-disclosure"
                  data-open={Boolean(options.notesVaultOpen)}
                >
                  <div className="desktop-notes-vault-disclosure__content">
                    <DesktopNotesVaultNav />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </section>
  );
}
