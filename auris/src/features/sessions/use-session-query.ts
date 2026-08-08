import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import {
  getSessionById,
  getSessionArtifacts,
  listRecentSessionsByUser,
  createEmptySessionRecord,
  deleteSessionRecord,
  savePreparedSessionArtifacts,
} from '@/server/repositories/session-repository';
import type {
  SessionRecord,
  SentenceRecord,
  WordTokenRecord,
  SessionSourceType,
} from '@/features/sessions/session.types';

/**
 * Fetch a single session by ID
 */
export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => getSessionById(sessionId!),
    enabled: !!sessionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch session artifacts (sentences + word tokens)
 */
export function useSessionArtifacts(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.artifacts(sessionId ?? ''),
    queryFn: () => getSessionArtifacts(sessionId!),
    enabled: !!sessionId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch recent sessions for a user
 */
export function useRecentSessions(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.list(userId ?? ''),
    queryFn: () => listRecentSessionsByUser(userId!),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Create a new empty session
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      userId: string;
      sourceType: SessionSourceType;
      title: string;
      originalText: string;
      normalizedText?: string;
    }) => createEmptySessionRecord(input),

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

    onSuccess: (newSession, input) => {
      // Update cache with real session
      queryClient.setQueryData(queryKeys.sessions.detail(newSession.id), newSession);
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(input.userId) });
    },

    onError: (error, input, context) => {
      // Rollback on error
      if (context?.previousSessions) {
        queryClient.setQueryData(queryKeys.sessions.list(input.userId), context.previousSessions);
      }
      console.error('Failed to create session:', error);
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => deleteSessionRecord(sessionId),

    onMutate: async (sessionId) => {
      // Get session to find userId
      const session = queryClient.getQueryData<SessionRecord>(
        queryKeys.sessions.detail(sessionId)
      );

      if (session) {
        await queryClient.cancelQueries({ queryKey: queryKeys.sessions.list(session.userId) });

        const previousSessions = queryClient.getQueryData(queryKeys.sessions.list(session.userId));

        // Optimistically remove session
        queryClient.setQueryData(
          queryKeys.sessions.list(session.userId),
          (old: SessionRecord[] = []) => old.filter((s) => s.id !== sessionId)
        );

        return { previousSessions, userId: session.userId };
      }

      return {};
    },

    onSuccess: (_, sessionId, context) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
      queryClient.removeQueries({ queryKey: queryKeys.sessions.artifacts(sessionId) });

      if (context?.userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(context.userId) });
      }
    },

    onError: (error, sessionId, context) => {
      // Rollback on error
      if (context?.previousSessions && context?.userId) {
        queryClient.setQueryData(queryKeys.sessions.list(context.userId), context.previousSessions);
      }
      console.error('Failed to delete session:', error);
    },
  });
}

/**
 * Save prepared session artifacts
 */
export function useSaveSessionArtifacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      status: SessionRecord['status'];
      audioUrl: string | null;
      durationMs: number | null;
      voiceId: string;
      sentences: SentenceRecord[];
      wordTokens: WordTokenRecord[];
    }) => savePreparedSessionArtifacts(input),

    onMutate: async (input) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions.detail(input.sessionId) });
      await queryClient.cancelQueries({
        queryKey: queryKeys.sessions.artifacts(input.sessionId),
      });

      // Snapshot previous values
      const previousSession = queryClient.getQueryData(
        queryKeys.sessions.detail(input.sessionId)
      );
      const previousArtifacts = queryClient.getQueryData(
        queryKeys.sessions.artifacts(input.sessionId)
      );

      // Optimistically update session
      queryClient.setQueryData(
        queryKeys.sessions.detail(input.sessionId),
        (old: SessionRecord | undefined) =>
          old
            ? {
                ...old,
                status: input.status,
                audioUrl: input.audioUrl,
                durationMs: input.durationMs,
                voiceId: input.voiceId,
                updatedAt: new Date().toISOString(),
              }
            : undefined
      );

      // Optimistically update artifacts
      queryClient.setQueryData(queryKeys.sessions.artifacts(input.sessionId), {
        sentences: input.sentences,
        wordTokens: input.wordTokens,
      });

      return { previousSession, previousArtifacts };
    },

    onSuccess: (updatedSession, input) => {
      // Update cache with real data
      queryClient.setQueryData(queryKeys.sessions.detail(input.sessionId), updatedSession);
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(updatedSession.userId) });
    },

    onError: (error, input, context) => {
      // Rollback on error
      if (context?.previousSession) {
        queryClient.setQueryData(
          queryKeys.sessions.detail(input.sessionId),
          context.previousSession
        );
      }
      if (context?.previousArtifacts) {
        queryClient.setQueryData(
          queryKeys.sessions.artifacts(input.sessionId),
          context.previousArtifacts
        );
      }
      console.error('Failed to save session artifacts:', error);
    },
  });
}

/**
 * Prefetch session for optimistic navigation
 */
export function usePrefetchSession() {
  const queryClient = useQueryClient();

  return (sessionId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.sessions.detail(sessionId),
      queryFn: () => getSessionById(sessionId),
      staleTime: 10 * 60 * 1000,
    });
  };
}
