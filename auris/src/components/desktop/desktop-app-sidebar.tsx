"use client";

import {
  Fragment,
  Suspense,
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
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

import aurisLogo from "@/app/icon.png";

import {
  DESKTOP_NAV_ITEMS,
  type DesktopNavItem,
  type DesktopNavGroupId,
} from "@/components/desktop/desktop-shell-fixtures";
import { DesktopReadingSidebarNav } from "@/components/desktop/desktop-reading-sidebar-nav";
import { DesktopNotesVaultNav } from "@/components/desktop/desktop-notes-vault-nav";
import { createNotesRootNavigateEvent } from "@/components/notes-v2/notes-navigation";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";
import "@/components/auris-ui/auris-ui.css";

type DesktopAppSidebarProps = {
  activeNavId?: string;
  activeWorkspace: AppWorkspaceId;
  isExpanded?: boolean;
  isVisible: boolean;
  onNavigate?: () => void;
  onToggleExpanded?: () => void;
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
    case "home":
      return (
        <svg
          aria-hidden="true"
          className="desktop-app-sidebar__glyph"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 10.5 12 5l7 5.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-3V20H6a1 1 0 0 1-1-1v-8.5Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
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
  item: DesktopNavItem;
  onActiveClick?: () => void;
  onBeforeNavigate?: () => void;
  onNavigate?: () => void;
};

function DesktopSidebarLink({
  isActive,
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

function SidebarToggleGlyph({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="desktop-app-sidebar__toggle-glyph"
      viewBox="0 0 24 24"
    >
      <rect
        fill="none"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        width="16"
        x="4"
        y="5"
      />
      <path
        d={expanded ? "M10 5v14" : "M14 5v14"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function DesktopAppSidebar({
  activeNavId,
  activeWorkspace,
  isExpanded = false,
  isVisible,
  onNavigate,
  onToggleExpanded,
  onBlurCapture,
  onFocusCapture,
  onMouseEnter,
  onMouseLeave,
  isPersistentRail = false,
}: DesktopAppSidebarProps) {
  const pathname = usePathname();
  const resolvedActiveId = activeNavId ?? activeWorkspace;
  const isReadingRoute =
    resolvedActiveId === "reading" ||
    pathname === "/reading" ||
    pathname.startsWith("/reading/");
  const showReadingNav = isExpanded && isReadingRoute;
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
    toggleNotesVaultOpen();
  }, [toggleNotesVaultOpen]);
  const showNotesVaultNav =
    resolvedActiveId === "notes" && (isNotesVaultOpen || isExpanded);

  return (
    <aside
      aria-label="App navigation"
      aria-hidden={isVisible || isPersistentRail ? undefined : true}
      className="desktop-app-sidebar"
      data-expanded={isExpanded ? "true" : "false"}
      data-reading-nav={showReadingNav ? "true" : "false"}
      data-visible={isVisible ? "true" : "false"}
      onBlurCapture={onBlurCapture}
      onFocusCapture={onFocusCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="desktop-app-sidebar__brand">
        {isExpanded ? (
          <>
            <div className="desktop-app-sidebar__brand-main">
              <Image
                alt=""
                className="desktop-app-sidebar__brand-img"
                height={28}
                priority
                src={aurisLogo}
                width={28}
              />
              <span className="desktop-app-sidebar__brand-copy">
                <strong>Auris</strong>
              </span>
            </div>
            {onToggleExpanded ? (
              <button
                aria-expanded
                aria-label="收起侧栏"
                className="desktop-app-sidebar__toggle"
                onClick={onToggleExpanded}
                type="button"
              >
                <SidebarToggleGlyph expanded />
              </button>
            ) : null}
          </>
        ) : onToggleExpanded ? (
          <button
            aria-expanded={false}
            aria-label="展开侧栏"
            className="desktop-app-sidebar__brand-swap"
            onClick={onToggleExpanded}
            type="button"
          >
            <span className="desktop-app-sidebar__brand-swap-face desktop-app-sidebar__brand-swap-face--toggle">
              <SidebarToggleGlyph expanded={false} />
            </span>
          </button>
        ) : (
          <div className="desktop-app-sidebar__brand-main">
            <Image
              alt=""
              className="desktop-app-sidebar__brand-img"
              height={28}
              priority
              src={aurisLogo}
              width={28}
            />
          </div>
        )}
      </div>
      <div className="desktop-app-sidebar__sections">
        {(isPersistentRail
          ? NAV_GROUP_ORDER.filter((group) => group !== "tools")
          : NAV_GROUP_ORDER
        ).map((group) =>
          renderNavGroup(group, resolvedActiveId, onNavigate, {
            notesVaultOpen: showNotesVaultNav,
            onNotesVaultNavigate: handleNotesRootNavigate,
            onNotesVaultToggle: handleNotesRootNavigate,
            sidebarExpanded: isExpanded,
            replaceReadingWithTree: showReadingNav && group === "primary",
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
    replaceReadingWithTree?: boolean;
    sidebarExpanded?: boolean;
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
          if (options.replaceReadingWithTree && item.id === "reading") {
            return (
              <Suspense fallback={null} key="reading-tree">
                <DesktopReadingSidebarNav />
              </Suspense>
            );
          }

          return (
            <Fragment key={item.id}>
              <DesktopSidebarLink
                isActive={item.id === resolvedActiveId}
                item={item}
                onActiveClick={
                  item.id === "notes" ? options.onNotesVaultToggle : undefined
                }
                onBeforeNavigate={
                  item.id === "notes" ? options.onNotesVaultNavigate : undefined
                }
                onNavigate={onNavigate}
              />
              {item.id === "notes" && options.notesVaultOpen ? (
                <DesktopNotesVaultNav
                  isSidebarExpanded={Boolean(options.sidebarExpanded)}
                />
              ) : null}
            </Fragment>
          );
        })}
      </nav>
    </section>
  );
}
