/**
 * Wordbook Query Hooks (Refactored with Service Layer)
 *
 * Uses WordbookService instead of directly calling localStorage.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { useService } from '@/lib/di/service-provider';
import { ServiceKeys } from '@/lib/di/service-container';
import type { IWordbookService, SavedWordRecord } from '@/services/interfaces/wordbook-service.interface';

/**
 * Fetch all words
 */
export function useWordbook() {
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useQuery({
    queryKey: queryKeys.wordbook.lists(),
    queryFn: () => wordbookService.listAll(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Search words by query
 */
export function useSearchWords(query: string) {
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useQuery({
    queryKey: queryKeys.wordbook.search(query),
    queryFn: () => wordbookService.search(query),
    enabled: query.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Check if a word exists
 */
export function useHasWord(word: string) {
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useQuery({
    queryKey: queryKeys.wordbook.detail(word),
    queryFn: () => wordbookService.hasWord(word),
    enabled: word.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Add a word
 */
export function useAddWord() {
  const queryClient = useQueryClient();
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useMutation({
    mutationFn: (record: SavedWordRecord) => wordbookService.addWord(record),

    onMutate: async (newWord) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.wordbook.lists() });

      // Snapshot previous value
      const previousWords = queryClient.getQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists()
      );

      // Optimistically add word
      queryClient.setQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists(),
        (old = []) => [
          newWord,
          ...old.filter((item) => item.word.toLowerCase() !== newWord.word.toLowerCase()),
        ]
      );

      return { previousWords };
    },

    onError: (error, newWord, context) => {
      // Rollback on error
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.wordbook.lists(), context.previousWords);
      }
    },

    onSuccess: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbook.lists() });
    },
  });
}

/**
 * Remove a word
 */
export function useRemoveWord() {
  const queryClient = useQueryClient();
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useMutation({
    mutationFn: (word: string) => wordbookService.removeWord(word),

    onMutate: async (wordToRemove) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.wordbook.lists() });

      // Snapshot previous value
      const previousWords = queryClient.getQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists()
      );

      // Optimistically remove word
      queryClient.setQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists(),
        (old = []) =>
          old.filter((item) => item.word.toLowerCase() !== wordToRemove.toLowerCase())
      );

      return { previousWords };
    },

    onError: (error, wordToRemove, context) => {
      // Rollback on error
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.wordbook.lists(), context.previousWords);
      }
    },

    onSuccess: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbook.lists() });
    },
  });
}

/**
 * Import multiple words
 */
export function useImportWords() {
  const queryClient = useQueryClient();
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useMutation({
    mutationFn: (words: SavedWordRecord[]) => wordbookService.importWords(words),

    onSuccess: () => {
      // Invalidate wordbook cache
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbook.lists() });
    },
  });
}

/**
 * Export all words
 */
export function useExportWords() {
  const wordbookService = useService<IWordbookService>(ServiceKeys.WORDBOOK_SERVICE);

  return useMutation({
    mutationFn: () => wordbookService.exportWords(),
  });
}
