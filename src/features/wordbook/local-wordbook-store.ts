/**
 * @deprecated Import React Query hooks from
 * @/features/wordbook/use-wordbook-query instead.
 *
 * This compatibility file intentionally stays browser-safe because it is used
 * by client components that should not pull server-side query dependencies into
 * the client bundle.
 */

const WORDBOOK_STORAGE_KEY = 'english-shadowing-wordbook';

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

type WordbookRecord = SavedWordRecord;

function readWordsFromStorage(storage: Storage): WordbookRecord[] {
  try {
    const raw = storage.getItem(WORDBOOK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as WordbookRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWordsToStorage(storage: Storage, words: WordbookRecord[]) {
  storage.setItem(WORDBOOK_STORAGE_KEY, JSON.stringify(words));
}

/**
 * @deprecated Use useWordbook hook instead
 */
export function getBrowserWordbookStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return createLocalWordbookStorage(window.localStorage);
}

/**
 * @deprecated Use useWordbook hook instead
 */
export function createLocalWordbookStorage(storage: Storage) {
  return {
    async deleteWord(word: string) {
      const normalizedWord = word.trim().toLowerCase();
      const updated = readWordsFromStorage(storage).filter(
        (item) => item.word.toLowerCase() !== normalizedWord,
      );
      writeWordsToStorage(storage, updated);
    },
    async listWords() {
      return readWordsFromStorage(storage);
    },
    readWordsSnapshot() {
      return readWordsFromStorage(storage);
    },
    async saveWord(record: WordbookRecord) {
      const updated = [
        record,
        ...readWordsFromStorage(storage).filter(
          (item) => item.word.toLowerCase() !== record.word.toLowerCase(),
        ),
      ];
      writeWordsToStorage(storage, updated);
    },
  };
}

export type LocalWordbookStorage = ReturnType<typeof createLocalWordbookStorage>;
