"use client";

import {
  Suspense,
  useEffect,
  startTransition,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
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

type RippleState = {
  isVisible: boolean;
  x: number;
  y: number;
};

const NAV_GROUP_ORDER: DesktopNavGroupId[] = ["primary", "library", "tools"];
const NAVIGATION_BURST_DURATION_MS = 520;
const PREFETCHED_NAVIGATION_COMMIT_DELAY_MS = 0;
const FALLBACK_NAVIGATION_COMMIT_DELAY_MS = 32;
const LINK_BURST_PARTICLES = [
  { delay: "0ms", rotate: "-72deg", x: "-18px", y: "-20px" },
  { delay: "34ms", rotate: "-34deg", x: "8px", y: "-24px" },
  { delay: "18ms", rotate: "6deg", x: "24px", y: "-10px" },
  { delay: "48ms", rotate: "42deg", x: "22px", y: "18px" },
  { delay: "12ms", rotate: "92deg", x: "0px", y: "27px" },
  { delay: "58ms", rotate: "138deg", x: "-22px", y: "16px" },
  { delay: "28ms", rotate: "184deg", x: "-28px", y: "-2px" },
  { delay: "66ms", rotate: "224deg", x: "-8px", y: "-30px" },
] as const;

function getGroupItems(group: DesktopNavGroupId) {
  return DESKTOP_NAV_ITEMS.filter((item) => item.group === group);
}

function shouldUseNativeLinkBehavior(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function NavGlyph({ itemId }: { itemId: DesktopNavItem["id"] }) {
  switch (itemId) {
    case "home":
      return (
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
        <svg aria-hidden="true" className="desktop-app-sidebar__glyph" viewBox="0 0 24 24">
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
  onNavigate?: () => void;
};

function DesktopSidebarLink({
  isActive,
  item,
  onNavigate,
}: DesktopSidebarLinkProps) {
  const router = useRouter();
  const burstTimeoutRef = useRef<number | null>(null);
  const hasCommittedNavigationRef = useRef(false);
  const hasPrefetchedRouteRef = useRef(false);
  const navigationTimeoutRef = useRef<number | null>(null);
  const [isBursting, setIsBursting] = useState(false);
  const [rippleState, setRippleState] = useState<RippleState>({
    isVisible: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    return () => {
      if (burstTimeoutRef.current !== null) {
        window.clearTimeout(burstTimeoutRef.current);
      }

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

  function updateRipplePosition(target: EventTarget & HTMLAnchorElement, clientX: number, clientY: number) {
    const bounds = target.getBoundingClientRect();

    setRippleState({
      isVisible: true,
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    });
  }

  function handleMouseEnter(event: MouseEvent<HTMLAnchorElement>) {
    prefetchRoute();
    updateRipplePosition(event.currentTarget, event.clientX, event.clientY);
  }

  function handleMouseMove(event: MouseEvent<HTMLAnchorElement>) {
    updateRipplePosition(event.currentTarget, event.clientX, event.clientY);
  }

  function handleMouseLeave() {
    setRippleState((currentState) => ({
      ...currentState,
      isVisible: false,
    }));
  }

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    prefetchRoute();
    const bounds = event.currentTarget.getBoundingClientRect();

    setRippleState({
      isVisible: true,
      x: bounds.width * 0.5,
      y: bounds.height * 0.5,
    });
  }

  function handleBlur() {
    setRippleState((currentState) => ({
      ...currentState,
      isVisible: false,
    }));
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (shouldUseNativeLinkBehavior(event)) {
      return;
    }

    event.preventDefault();
    const hadPrefetchedRoute = hasPrefetchedRouteRef.current;
    prefetchRoute();

    if (
      isActive ||
      hasCommittedNavigationRef.current ||
      navigationTimeoutRef.current !== null
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = event.clientX > 0 ? event.clientX - bounds.left : bounds.width * 0.5;
    const nextY = event.clientY > 0 ? event.clientY - bounds.top : bounds.height * 0.5;

    setRippleState({
      isVisible: true,
      x: nextX,
      y: nextY,
    });
    setIsBursting(true);

    if (burstTimeoutRef.current !== null) {
      window.clearTimeout(burstTimeoutRef.current);
    }

    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
    }

    navigationTimeoutRef.current = window.setTimeout(() => {
      hasCommittedNavigationRef.current = true;
      startTransition(() => {
        onNavigate?.();
        router.push(item.href);
      });
      navigationTimeoutRef.current = null;
    }, hadPrefetchedRoute ? PREFETCHED_NAVIGATION_COMMIT_DELAY_MS : FALLBACK_NAVIGATION_COMMIT_DELAY_MS);

    burstTimeoutRef.current = window.setTimeout(() => {
      setIsBursting(false);
      burstTimeoutRef.current = null;
    }, NAVIGATION_BURST_DURATION_MS);
  }

  const rippleStyle = {
    "--desktop-link-ripple-x": `${rippleState.x}px`,
    "--desktop-link-ripple-y": `${rippleState.y}px`,
  } as CSSProperties;

  return (
    <Link
      aria-label={item.label}
      className="desktop-app-sidebar__link"
      data-active={isActive ? "true" : "false"}
      data-bursting={isBursting ? "true" : "false"}
      data-hovered={rippleState.isVisible ? "true" : "false"}
      href={item.href}
      onClick={handleClick}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={rippleStyle}
      title={item.label}
    >
      <span aria-hidden="true" className="desktop-app-sidebar__link-ripple" />
      <span aria-hidden="true" className="desktop-app-sidebar__link-impact">
        <span className="desktop-app-sidebar__link-impact-core" />
        <span className="desktop-app-sidebar__link-impact-ring desktop-app-sidebar__link-impact-ring--primary" />
        <span className="desktop-app-sidebar__link-impact-ring desktop-app-sidebar__link-impact-ring--secondary" />
      </span>
      <span aria-hidden="true" className="desktop-app-sidebar__link-particle-field">
        {LINK_BURST_PARTICLES.map((particle, index) => (
          <span
            className="desktop-app-sidebar__link-particle"
            key={`${particle.rotate}-${index}`}
            style={
              {
                "--sidebar-particle-delay": particle.delay,
                "--sidebar-particle-rotate": particle.rotate,
                "--sidebar-particle-x": particle.x,
                "--sidebar-particle-y": particle.y,
              } as CSSProperties
            }
          />
        ))}
      </span>
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
            <span className="desktop-app-sidebar__brand-swap-face desktop-app-sidebar__brand-swap-face--logo">
              <Image
                alt=""
                className="desktop-app-sidebar__brand-img"
                height={28}
                priority
                src={aurisLogo}
                width={28}
              />
            </span>
            <span
              aria-hidden="true"
              className="desktop-app-sidebar__brand-swap-face desktop-app-sidebar__brand-swap-face--toggle"
            >
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
  options: { replaceReadingWithTree?: boolean } = {},
) {
  const items = getGroupItems(group);

  return (
    <section className="desktop-app-sidebar__group" data-group={group} key={group}>
      <nav aria-label={`${group} navigation`} className="desktop-app-sidebar__nav">
        {items.map((item) => {
          if (options.replaceReadingWithTree && item.id === "reading") {
            return (
              <Suspense fallback={null} key="reading-tree">
                <DesktopReadingSidebarNav />
              </Suspense>
            );
          }

          return (
            <DesktopSidebarLink
              isActive={item.id === resolvedActiveId}
              key={item.id}
              item={item}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>
    </section>
  );
}
