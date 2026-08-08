"use client";

import { useEffect } from "react";

export const DESKTOP_ROUTE_PREFETCH_DELAY_MS = 400;
export const DESKTOP_ROUTE_PREFETCH_STAGGER_MS = 160;
export const DEFAULT_DESKTOP_ROUTE_PREFETCHES = [
  "/notes",
  "/assessment",
  "/video",
] as const;

const prefetchedDesktopRoutes = new Set<string>();

type DesktopRoutePrefetchInput = {
  enabled?: boolean;
  router: {
    prefetch: (href: string) => void;
  };
  routes?: readonly string[];
};

export function resetDesktopRoutePrefetchCacheForTests() {
  prefetchedDesktopRoutes.clear();
}

function prefetchDesktopRoute(prefetch: (href: string) => void, route: string) {
  if (prefetchedDesktopRoutes.has(route)) {
    return;
  }

  prefetchedDesktopRoutes.add(route);
  prefetch(route);
}

export function useDesktopRoutePrefetch({
  enabled = true,
  router,
  routes = DEFAULT_DESKTOP_ROUTE_PREFETCHES,
}: DesktopRoutePrefetchInput) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const timeoutIds = routes.map((route, index) =>
      window.setTimeout(() => {
        prefetchDesktopRoute(router.prefetch, route);
      }, DESKTOP_ROUTE_PREFETCH_DELAY_MS + index * DESKTOP_ROUTE_PREFETCH_STAGGER_MS),
    );

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [enabled, router, routes]);
}
