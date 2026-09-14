/**
 * Performance Monitoring for State Management
 *
 * Tracks state updates, cache hits, and performance metrics
 */

import { queryClient } from '@/lib/query-client';

type ZustandLikeStore = {
  setState: (...args: unknown[]) => unknown;
};

declare global {
  interface Window {
    __statePerformance?: {
      getReport: () => ReturnType<StatePerformanceMonitor['getReport']>;
      logReport: () => void;
      reset: () => void;
    };
  }
}

interface PerformanceMetrics {
  stateUpdates: number;
  cacheHits: number;
  cacheMisses: number;
  queryDuration: number[];
  mutationDuration: number[];
  lastReset: number;
}

class StatePerformanceMonitor {
  private metrics: PerformanceMetrics = {
    stateUpdates: 0,
    cacheHits: 0,
    cacheMisses: 0,
    queryDuration: [],
    mutationDuration: [],
    lastReset: Date.now(),
  };

  private enabled = process.env.NODE_ENV === 'development';

  /**
   * Track a state update
   */
  trackStateUpdate(storeName: string) {
    if (!this.enabled) return;

    this.metrics.stateUpdates++;
    console.log(`[State Update] ${storeName} - Total: ${this.metrics.stateUpdates}`);
  }

  /**
   * Track a cache hit
   */
  trackCacheHit(queryKey: readonly unknown[]) {
    if (!this.enabled) return;

    this.metrics.cacheHits++;
    console.log(`[Cache Hit] ${JSON.stringify(queryKey)} - Total: ${this.metrics.cacheHits}`);
  }

  /**
   * Track a cache miss
   */
  trackCacheMiss(queryKey: readonly unknown[]) {
    if (!this.enabled) return;

    this.metrics.cacheMisses++;
    console.log(`[Cache Miss] ${JSON.stringify(queryKey)} - Total: ${this.metrics.cacheMisses}`);
  }

  /**
   * Track query duration
   */
  trackQueryDuration(queryKey: readonly unknown[], duration: number) {
    if (!this.enabled) return;

    this.metrics.queryDuration.push(duration);
    if (duration > 1000) {
      console.warn(`[Slow Query] ${JSON.stringify(queryKey)} took ${duration}ms`);
    }
  }

  /**
   * Track mutation duration
   */
  trackMutationDuration(mutationKey: readonly unknown[], duration: number) {
    if (!this.enabled) return;

    this.metrics.mutationDuration.push(duration);
    if (duration > 2000) {
      console.warn(`[Slow Mutation] ${JSON.stringify(mutationKey)} took ${duration}ms`);
    }
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;
    return (this.metrics.cacheHits / total) * 100;
  }

  /**
   * Get average query duration
   */
  getAverageQueryDuration(): number {
    if (this.metrics.queryDuration.length === 0) return 0;
    const sum = this.metrics.queryDuration.reduce((a, b) => a + b, 0);
    return sum / this.metrics.queryDuration.length;
  }

  /**
   * Get average mutation duration
   */
  getAverageMutationDuration(): number {
    if (this.metrics.mutationDuration.length === 0) return 0;
    const sum = this.metrics.mutationDuration.reduce((a, b) => a + b, 0);
    return sum / this.metrics.mutationDuration.length;
  }

  /**
   * Get performance report
   */
  getReport() {
    const uptime = Date.now() - this.metrics.lastReset;
    const uptimeMinutes = Math.floor(uptime / 60000);

    return {
      uptime: `${uptimeMinutes} minutes`,
      stateUpdates: this.metrics.stateUpdates,
      cacheHitRate: `${this.getCacheHitRate().toFixed(2)}%`,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      avgQueryDuration: `${this.getAverageQueryDuration().toFixed(2)}ms`,
      avgMutationDuration: `${this.getAverageMutationDuration().toFixed(2)}ms`,
      totalQueries: this.metrics.queryDuration.length,
      totalMutations: this.metrics.mutationDuration.length,
    };
  }

  /**
   * Log performance report
   */
  logReport() {
    if (!this.enabled) return;

    console.group('📊 State Management Performance Report');
    const report = this.getReport();
    Object.entries(report).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    console.groupEnd();
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      stateUpdates: 0,
      cacheHits: 0,
      cacheMisses: 0,
      queryDuration: [],
      mutationDuration: [],
      lastReset: Date.now(),
    };
    console.log('[Performance Monitor] Metrics reset');
  }

  /**
   * Monitor Query Client
   */
  monitorQueryClient() {
    if (!this.enabled) return;

    const cache = queryClient.getQueryCache();

    // Track cache events
    cache.subscribe((event) => {
      if (event.type === 'added') {
        this.trackCacheMiss(event.query.queryKey);
      } else if (event.type === 'updated') {
        const query = event.query;
        if (query.state.dataUpdateCount > 1) {
          this.trackCacheHit(query.queryKey);
        }
      }
    });

    // Track query durations
    const originalFetch = cache.build.bind(cache);
    cache.build = (client, options, state) => {
      const query = originalFetch(client, options, state);
      const originalFetchFn = query.fetch.bind(query);

      query.fetch = async (...args) => {
        const start = performance.now();
        try {
          return await originalFetchFn(...args);
        } finally {
          const duration = performance.now() - start;
          this.trackQueryDuration(query.queryKey, duration);
        }
      };

      return query;
    };
  }

  /**
   * Monitor Zustand stores
   */
  monitorZustandStore(storeName: string, store: ZustandLikeStore) {
    if (!this.enabled) return;

    const originalSetState = store.setState;
    store.setState = (...args: unknown[]) => {
      this.trackStateUpdate(storeName);
      return originalSetState(...args);
    };
  }
}

// Singleton instance
export const performanceMonitor = new StatePerformanceMonitor();

// Auto-log report every 5 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    performanceMonitor.logReport();
  }, 5 * 60 * 1000);
}

// Expose to window for manual inspection
if (typeof window !== 'undefined') {
  window.__statePerformance = {
    getReport: () => performanceMonitor.getReport(),
    logReport: () => performanceMonitor.logReport(),
    reset: () => performanceMonitor.reset(),
  };
}
