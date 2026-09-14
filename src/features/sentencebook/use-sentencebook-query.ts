import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';

export type SavedSentenceRecord = {
  createdAt: string;
  id: string;
  sourceLabel: string;
  text: string;
  translation: string;
};

const SENTENCEBOOK_STORAGE_KEY = 'english-shadowing-sentencebook';

/**
 * Read sentences from localStorage
 */
function readSentences(): SavedSentenceRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(SENTENCEBOOK_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as SavedSentenceRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Write sentences to localStorage
 */
function writeSentences(sentences: SavedSentenceRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SENTENCEBOOK_STORAGE_KEY, JSON.stringify(sentences));
}

/**
 * Fetch all saved sentences
 */
export function useSentencebook() {
  return useQuery({
    queryKey: queryKeys.sentencebook.lists(),
    queryFn: async () => {
      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 0));
      return readSentences();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Add a sentence to sentencebook
 */
export function useAddSentence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record: SavedSentenceRecord) => {
      const sentences = readSentences();
      const existing = sentences.filter((item) => item.id !== record.id);
      const updated = [record, ...existing];
      writeSentences(updated);
      return updated;
    },

    onMutate: async (newSentence) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sentencebook.lists() });

      // Snapshot previous value
      const previousSentences = queryClient.getQueryData<SavedSentenceRecord[]>(
        queryKeys.sentencebook.lists()
      );

      // Optimistically update
      queryClient.setQueryData<SavedSentenceRecord[]>(
        queryKeys.sentencebook.lists(),
        (old = []) => {
          const filtered = old.filter((item) => item.id !== newSentence.id);
          return [newSentence, ...filtered];
        }
      );

      return { previousSentences };
    },

    onError: (error, newSentence, context) => {
      // Rollback on error
      if (context?.previousSentences) {
        queryClient.setQueryData(queryKeys.sentencebook.lists(), context.previousSentences);
      }
      console.error('Failed to add sentence:', error);
    },

    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.sentencebook.lists() });
    },
  });
}

/**
 * Remove a sentence from sentencebook
 */
export function useRemoveSentence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const sentences = readSentences();
      const updated = sentences.filter((item) => item.id !== id);
      writeSentences(updated);
      return updated;
    },

    onMutate: async (idToRemove) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sentencebook.lists() });

      // Snapshot previous value
      const previousSentences = queryClient.getQueryData<SavedSentenceRecord[]>(
        queryKeys.sentencebook.lists()
      );

      // Optimistically update
      queryClient.setQueryData<SavedSentenceRecord[]>(
        queryKeys.sentencebook.lists(),
        (old = []) => old.filter((item) => item.id !== idToRemove)
      );

      return { previousSentences };
    },

    onError: (error, id, context) => {
      // Rollback on error
      if (context?.previousSentences) {
        queryClient.setQueryData(queryKeys.sentencebook.lists(), context.previousSentences);
      }
      console.error('Failed to remove sentence:', error);
    },

    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.sentencebook.lists() });
    },
  });
}

/**
 * Search sentences by query
 */
export function useSearchSentences(query: string) {
  const { data: sentences = [] } = useSentencebook();

  if (!query.trim()) return sentences;

  const lowerQuery = query.toLowerCase();
  return sentences.filter(
    (sentence) =>
      sentence.text.toLowerCase().includes(lowerQuery) ||
      sentence.translation.toLowerCase().includes(lowerQuery) ||
      sentence.sourceLabel.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get sentence by ID
 */
export function useSentenceById(id: string | null) {
  const { data: sentences = [] } = useSentencebook();
  return sentences.find((sentence) => sentence.id === id) ?? null;
}

/**
 * Get sentences by source
 */
export function useSentencesBySource(sourceLabel: string) {
  const { data: sentences = [] } = useSentencebook();
  return sentences.filter((sentence) => sentence.sourceLabel === sourceLabel);
}
