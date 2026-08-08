/**
 * Session Query Hooks (Refactored with Service Layer)
 *
 * Uses SessionService instead of directly calling repository functions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { useService } from '@/lib/di/service-provider';
import { ServiceKeys } from '@/lib/di/service-container';
import type { ISessionService } from '@/services/interfaces/session-service.interface';
import type {
  SaveArtifactsInput,
} from '@/services/interfaces/session-service.interface';
import type {
  SessionRecord,
  SessionSourceType,
} from '@/features/sessions/session.types';

/**
 * Fetch a single session by ID
 */
export function useSession(sessionId: string | null) {
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => sessionService.getById(sessionId!),
    enabled: !!sessionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch session with all artifacts (sentences + word tokens)
 */
export function useSessionWithArtifacts(sessionId: string | null) {
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useQuery({
    queryKey: queryKeys.sessions.artifacts(sessionId ?? ''),
    queryFn: () => sessionService.getWithArtifacts(sessionId!),
    enabled: !!sessionId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch recent sessions for a user
 */
export function useRecentSessions(userId: string | null) {
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useQuery({
    queryKey: queryKeys.sessions.list(userId ?? ''),
    queryFn: () => sessionService.listRecent(userId!),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Create a new empty session
 */
export function useCreateSession() {
  const queryClient = useQueryClient();
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useMutation({
    mutationFn: (input: {
      userId: string;
      sourceType: SessionSourceType;
      title: string;
      originalText: string;
      normalizedText?: string;
    }) => sessionService.create(input),

    onMutate: async (input) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions.list(input.userId) });

      // Snapshot previous value
      const previousSessions = queryClient.getQueryData(queryKeys.sessions.list(input.userId));

      // Optimistically add new session
      const optimisticSession: SessionRecord = {
        id: `temp-${Date.now()}`,
        userId: input.userId,
        sourceType: input.sourceType,
        title: input.title,
        originalText: input.originalText,
        normalizedText: input.normalizedText ?? input.originalText,
        status: 'draft',
        voiceId: 'alloy',
        speedDefault: 1,
        audioUrl: null,
        durationMs: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(
        queryKeys.sessions.list(input.userId),
        (old: SessionRecord[] = []) => [optimisticSession, ...old]
      );

      return { previousSessions };
    },

    onError: (error, input, context) => {
      // Rollback on error
      if (context?.previousSessions) {
        queryClient.setQueryData(queryKeys.sessions.list(input.userId), context.previousSessions);
      }
    },

    onSuccess: (newSession, input) => {
      // Update cache with real session
      queryClient.setQueryData(
        queryKeys.sessions.list(input.userId),
        (old: SessionRecord[] = []) => {
          const withoutTemp = old.filter((s) => !s.id.startsWith('temp-'));
          return [newSession, ...withoutTemp];
        }
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(input.userId) });
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useMutation({
    mutationFn: (sessionId: string) => sessionService.delete(sessionId),

    onMutate: async (sessionId) => {
      // Find which user's list this session belongs to
      const allQueries = queryClient.getQueriesData({ queryKey: queryKeys.sessions.lists() });

      for (const [queryKey, data] of allQueries) {
        if (Array.isArray(data)) {
          const session = data.find((s: SessionRecord) => s.id === sessionId);
          if (session) {
            await queryClient.cancelQueries({ queryKey });
            const previousSessions = queryClient.getQueryData(queryKey);

            // Optimistically remove
            queryClient.setQueryData(
              queryKey,
              (old: SessionRecord[] = []) => old.filter((s) => s.id !== sessionId)
            );

            return { previousSessions, queryKey };
          }
        }
      }

      return {};
    },

    onError: (error, sessionId, context) => {
      // Rollback on error
      if (context?.previousSessions && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSessions);
      }
    },

    onSuccess: (_, sessionId, context) => {
      // Invalidate related queries
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.artifacts(sessionId) });
    },
  });
}

/**
 * Save session artifacts (sentences + word tokens)
 */
export function useSaveSessionArtifacts() {
  const queryClient = useQueryClient();
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return useMutation<SessionRecord, Error, SaveArtifactsInput>({
    mutationFn: (input) => sessionService.saveArtifacts(input),

    onSuccess: (updatedSession, input) => {
      // Update session detail cache
      queryClient.setQueryData(
        queryKeys.sessions.detail(input.sessionId),
        updatedSession
      );

      // Invalidate artifacts cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.artifacts(input.sessionId),
      });

      // Invalidate user's session list
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.list(updatedSession.userId),
      });
    },
  });
}

/**
 * Prefetch a session
 */
export function usePrefetchSession() {
  const queryClient = useQueryClient();
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return (sessionId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.sessions.detail(sessionId),
      queryFn: () => sessionService.getById(sessionId),
      staleTime: 10 * 60 * 1000,
    });
  };
}

/**
 * Prefetch session with artifacts
 */
export function usePrefetchSessionWithArtifacts() {
  const queryClient = useQueryClient();
  const sessionService = useService<ISessionService>(ServiceKeys.SESSION_SERVICE);

  return (sessionId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.sessions.artifacts(sessionId),
      queryFn: () => sessionService.getWithArtifacts(sessionId),
      staleTime: 10 * 60 * 1000,
    });
  };
}
