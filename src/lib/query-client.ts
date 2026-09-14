import { QueryClient } from '@tanstack/react-query';

type StatusError = Error & {
  status?: number;
};

/**
 * Global React Query client configuration
 *
 * Manages all server state caching, refetching, and synchronization
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes before considering it stale
      staleTime: 5 * 60 * 1000,

      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,

      // Retry failed requests 3 times with exponential backoff
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && 'status' in error) {
          const status = (error as StatusError).status;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },

      // Don't refetch on window focus (can be noisy)
      refetchOnWindowFocus: false,

      // Refetch on network reconnect
      refetchOnReconnect: true,

      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
    mutations: {
      // Retry mutations once
      retry: 1,

      // Global error handler
      onError: (error) => {
        console.error('[Mutation Error]', error);
        // TODO: Show toast notification
      },
    },
  },
});

/**
 * Query key factory for consistent cache keys
 */
export const queryKeys = {
  // Sessions
  sessions: {
    all: ['sessions'] as const,
    lists: () => [...queryKeys.sessions.all, 'list'] as const,
    list: (userId: string) => [...queryKeys.sessions.lists(), userId] as const,
    details: () => [...queryKeys.sessions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.sessions.details(), id] as const,
    artifacts: (id: string) => [...queryKeys.sessions.detail(id), 'artifacts'] as const,
  },

  // Templates
  templates: {
    all: ['templates'] as const,
    lists: () => [...queryKeys.templates.all, 'list'] as const,
  },

  // Wordbook
  wordbook: {
    all: ['wordbook'] as const,
    lists: () => [...queryKeys.wordbook.all, 'list'] as const,
    details: () => [...queryKeys.wordbook.all, 'detail'] as const,
    detail: (word: string) => [...queryKeys.wordbook.details(), word] as const,
    searches: () => [...queryKeys.wordbook.all, 'search'] as const,
    search: (query: string) => [...queryKeys.wordbook.searches(), query] as const,
  },

  // Sentencebook
  sentencebook: {
    all: ['sentencebook'] as const,
    lists: () => [...queryKeys.sentencebook.all, 'list'] as const,
  },

  // Recordings
  recordings: {
    all: ['recordings'] as const,
    lists: () => [...queryKeys.recordings.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.recordings.all, 'detail', id] as const,
  },
} as const;

/**
 * Prefetch helper for optimistic navigation
 */
export async function prefetchSession(sessionId: string) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.sessions.detail(sessionId),
    queryFn: async () => {
      const { getSessionById } = await import('@/server/repositories/session-repository');
      return getSessionById(sessionId);
    },
  });
}

/**
 * Invalidate all session-related queries
 */
export function invalidateSessions() {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.sessions.all,
  });
}

/**
 * Clear all cached data (useful for logout)
 */
export function clearAllCache() {
  queryClient.clear();
}
