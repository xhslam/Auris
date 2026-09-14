/**
 * @deprecated Import React Query hooks from
 * @/features/sentencebook/use-sentencebook-query instead.
 *
 * This compatibility file intentionally stays browser-safe because it is used
 * by client components that should not pull server-side query dependencies into
 * the client bundle.
 */

const SENTENCEBOOK_STORAGE_KEY = 'english-shadowing-sentencebook';

export type SavedSentenceRecord = {
  createdAt: string;
  id: string;
  sourceLabel: string;
  sourceNotePath?: string;
  sourceType?: string;
  sourceUrl?: string | null;
  text: string;
  translation: string;
};

type SentencebookRecord = SavedSentenceRecord;

function readSentencesFromStorage(storage: Storage): SentencebookRecord[] {
  try {
    const raw = storage.getItem(SENTENCEBOOK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SentencebookRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSentencesToStorage(
  storage: Storage,
  sentences: SentencebookRecord[],
) {
  storage.setItem(SENTENCEBOOK_STORAGE_KEY, JSON.stringify(sentences));
}

/**
 * @deprecated Use useSentencebook hook instead
 */
export function getBrowserSentencebookStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return createLocalSentencebookStorage(window.localStorage);
}

/**
 * @deprecated Use useSentencebook hook instead
 */
export function createLocalSentencebookStorage(storage: Storage) {
  return {
    async deleteSentence(id: string) {
      const updated = readSentencesFromStorage(storage).filter(
        (item) => item.id !== id,
      );
      writeSentencesToStorage(storage, updated);
    },
    async listSentences() {
      return readSentencesFromStorage(storage);
    },
    async saveSentence(record: SentencebookRecord) {
      const updated = [
        record,
        ...readSentencesFromStorage(storage).filter((item) => item.id !== record.id),
      ];
      writeSentencesToStorage(storage, updated);
    },
  };
}

export type LocalSentencebookStorage = ReturnType<typeof createLocalSentencebookStorage>;
