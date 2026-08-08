import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';

export type SavedWordRecord = {
  createdAt: string;
  definitions: string[];
  endMs?: number;
  lexicalCategory: string;
  sentenceId?: string;
  sourceId?: string;
  sourceLabel: string;
  sourceNotePath?: string;
  sourceSentence?: string;
  sourceType?: string;
  sourceUrl?: string | null;
  startMs?: number;
  synonyms: string[];
  word: string;
};

const WORDBOOK_STORAGE_KEY = 'english-shadowing-wordbook';

/**
 * Read words from localStorage
 */
function readWords(): SavedWordRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(WORDBOOK_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as SavedWordRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Write words to localStorage
 */
function writeWords(words: SavedWordRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WORDBOOK_STORAGE_KEY, JSON.stringify(words));
}

/**
 * Fetch all saved words
 */
export function useWordbook() {
  return useQuery({
    queryKey: queryKeys.wordbook.lists(),
    queryFn: async () => {
      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 0));
      return readWords();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Add a word to wordbook
 */
export function useAddWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record: SavedWordRecord) => {
      const words = readWords();
      const existing = words.filter(
        (item) => item.word.toLowerCase() !== record.word.toLowerCase()
      );
      const updated = [record, ...existing];
      writeWords(updated);
      return updated;
    },

    onMutate: async (newWord) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.wordbook.lists() });

      // Snapshot previous value
      const previousWords = queryClient.getQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists()
      );

      // Optimistically update
      queryClient.setQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists(),
        (old = []) => {
          const filtered = old.filter(
            (item) => item.word.toLowerCase() !== newWord.word.toLowerCase()
          );
          return [newWord, ...filtered];
        }
      );

      return { previousWords };
    },

    onError: (error, newWord, context) => {
      // Rollback on error
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.wordbook.lists(), context.previousWords);
      }
      console.error('Failed to add word:', error);
    },

    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbook.lists() });
    },
  });
}

/**
 * Remove a word from wordbook
 */
export function useRemoveWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (word: string) => {
      const words = readWords();
      const normalizedWord = word.trim().toLowerCase();
      const updated = words.filter(
        (item) => item.word.toLowerCase() !== normalizedWord
      );
      writeWords(updated);
      return updated;
    },

    onMutate: async (wordToRemove) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.wordbook.lists() });

      // Snapshot previous value
      const previousWords = queryClient.getQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists()
      );

      // Optimistically update
      const normalizedWord = wordToRemove.trim().toLowerCase();
      queryClient.setQueryData<SavedWordRecord[]>(
        queryKeys.wordbook.lists(),
        (old = []) => old.filter((item) => item.word.toLowerCase() !== normalizedWord)
      );

      return { previousWords };
    },

    onError: (error, word, context) => {
      // Rollback on error
      if (context?.previousWords) {
        queryClient.setQueryData(queryKeys.wordbook.lists(), context.previousWords);
      }
      console.error('Failed to remove word:', error);
    },

    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.wordbook.lists() });
    },
  });
}

/**
 * Search words by query
 */
export function useSearchWords(query: string) {
  const { data: words = [] } = useWordbook();

  if (!query.trim()) return words;

  const lowerQuery = query.toLowerCase();
  return words.filter(
    (word) =>
      word.word.toLowerCase().includes(lowerQuery) ||
      word.definitions.some((def) => def.toLowerCase().includes(lowerQuery)) ||
      word.synonyms.some((syn) => syn.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Check if a word exists in wordbook
 */
export function useHasWord(word: string) {
  const { data: words = [] } = useWordbook();
  const normalizedWord = word.trim().toLowerCase();
  return words.some((item) => item.word.toLowerCase() === normalizedWord);
}
