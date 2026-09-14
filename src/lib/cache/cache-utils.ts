/**
 * Cache Optimization Utilities
 *
 * Provides utilities for optimizing TanStack Query cache
 */

import { queryClient } from '@/lib/query-client';

declare global {
  interface Window {
    __cacheUtils?: {
      stats: typeof getCacheStats;
      logStats: typeof logCacheStats;
      clear: typeof clearStaleCache;
      optimize: typeof optimizeCache;
      warmUp: typeof warmUpCache;
    };
  }
}

/**
 * Prefetch multiple queries in parallel
 */
export async function prefetchQueries(
  queries: Array<{ queryKey: unknown[]; queryFn: () => Promise<unknown> }>
) {
  await Promise.all(
    queries.map((query) =>
      queryClient.prefetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn,
      })
    )
  );
}

/**
 * Invalidate multiple query keys
 */
export function invalidateMultiple(queryKeys: unknown[][]) {
  queryKeys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key });
  });
}

/**
 * Clear stale cache entries
 */
export function clearStaleCache() {
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();

  let cleared = 0;
  queries.forEach((query) => {
    if (query.isStale()) {
      cache.remove(query);
      cleared++;
    }
  });

  console.log(`[Cache] Cleared ${cleared} stale entries`);
  return cleared;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();

  const stats = {
    total: queries.length,
    active: queries.filter((q) => q.getObserversCount() > 0).length,
    inactive: queries.filter((q) => q.getObserversCount() === 0).length,
    stale: queries.filter((q) => q.isStale()).length,
    fetching: queries.filter((q) => q.state.fetchStatus === 'fetching').length,
    error: queries.filter((q) => q.state.status === 'error').length,
  };

  return stats;
}

/**
 * Log cache statistics
 */
export function logCacheStats() {
  const stats = getCacheStats();
  console.group('📦 Cache Statistics');
  Object.entries(stats).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.groupEnd();
}

/**
 * Optimize cache by removing inactive queries
 */
export function optimizeCache() {
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();

  let removed = 0;
  queries.forEach((query) => {
    // Remove inactive queries that are stale
    if (query.getObserversCount() === 0 && query.isStale()) {
      cache.remove(query);
      removed++;
    }
  });

  console.log(`[Cache] Optimized - removed ${removed} inactive queries`);
  return removed;
}

/**
 * Warm up cache with common queries
 */
export async function warmUpCache(userId: string | null) {
  if (!userId) return;

  console.log('[Cache] Warming up cache...');

  await prefetchQueries([
    {
      queryKey: ['sessions', 'list', userId],
      queryFn: async () => {
        const { listRecentSessionsByUser } = await import('@/server/repositories/session-repository');
        return listRecentSessionsByUser(userId);
      },
    },
    {
      queryKey: ['wordbook', 'list'],
      queryFn: async () => {
        if (typeof window === 'undefined') return [];
        const raw = localStorage.getItem('english-shadowing-wordbook');
        return raw ? JSON.parse(raw) : [];
      },
    },
    {
      queryKey: ['sentencebook', 'list'],
      queryFn: async () => {
        if (typeof window === 'undefined') return [];
        const raw = localStorage.getItem('english-shadowing-sentencebook');
        return raw ? JSON.parse(raw) : [];
      },
    },
  ]);

  console.log('[Cache] Warm up complete');
}

/**
 * Schedule periodic cache cleanup
 */
export function schedulePeriodicCleanup(intervalMinutes = 10) {
  if (typeof window === 'undefined') return;

  const intervalMs = intervalMinutes * 60 * 1000;

  const cleanup = () => {
    console.log('[Cache] Running periodic cleanup...');
    const cleared = clearStaleCache();
    const optimized = optimizeCache();
    console.log(`[Cache] Cleanup complete - cleared: ${cleared}, optimized: ${optimized}`);
  };

  // Run cleanup on interval
  const intervalId = setInterval(cleanup, intervalMs);

  // Run cleanup on page visibility change
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      cleanup();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Cleanup on unmount
  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

// Expose to window for manual inspection
if (typeof window !== 'undefined') {
  window.__cacheUtils = {
    stats: getCacheStats,
    logStats: logCacheStats,
    clear: clearStaleCache,
    optimize: optimizeCache,
    warmUp: warmUpCache,
  };
}
