import wordIndex from "@/features/dictionary/personal-vocab/word-index.json";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import type {
  PersonalVocabEntry,
  PersonalVocabIndex,
} from "@/features/dictionary/personal-vocab/personal-vocab.types";
import {
  getEnglishLemmaCandidates,
  getIrregularEnglishLemma,
} from "@/features/dictionary/personal-vocab/english-inflections";

export class PersonalVocabLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_WORD" | "WORD_NOT_FOUND",
    public readonly status: number,
  ) {
    super(message);
  }
}

const index = wordIndex as PersonalVocabIndex;
let lookupMap: Map<string, PersonalVocabEntry> | null = null;

export function normalizePersonalVocabLookupKey(rawWord: string) {
  return rawWord
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function createLookupMap(entries: readonly PersonalVocabEntry[]) {
  const entriesByKey = new Map<string, PersonalVocabEntry>();

  for (const entry of entries) {
    if (entry.lookupKey && !entriesByKey.has(entry.lookupKey)) {
      entriesByKey.set(entry.lookupKey, entry);
    }
  }

  return entriesByKey;
}

function getLookupMap() {
  if (lookupMap) {
    return lookupMap;
  }

  lookupMap = createLookupMap(index.entries);

  return lookupMap;
}

export function resolvePersonalVocabEntry(
  rawWord: string,
  entries: readonly PersonalVocabEntry[] | ReadonlyMap<string, PersonalVocabEntry>,
): PersonalVocabEntry | null {
  const lookupKey = normalizePersonalVocabLookupKey(rawWord);
  const entriesByKey: ReadonlyMap<string, PersonalVocabEntry> = Array.isArray(
    entries,
  )
    ? createLookupMap(entries)
    : (entries as ReadonlyMap<string, PersonalVocabEntry>);
  const exactEntry = entriesByKey.get(lookupKey);

  if (exactEntry) {
    return exactEntry;
  }

  const irregularLemma = getIrregularEnglishLemma(lookupKey);

  if (irregularLemma) {
    const irregularEntry = entriesByKey.get(irregularLemma);

    if (irregularEntry) {
      return irregularEntry;
    }
  }

  for (const candidate of getEnglishLemmaCandidates(lookupKey)) {
    const candidateEntry = entriesByKey.get(candidate);

    if (candidateEntry) {
      return candidateEntry;
    }
  }

  return null;
}

function toDictionaryEntry(entry: PersonalVocabEntry): DictionaryEntry {
  return {
    meanings: [
      {
        definitions: [entry.definition],
        lexicalCategory: entry.partOfSpeech || "个人词库",
      },
    ],
    personal: {
      definition: entry.definition,
      fileName: entry.fileName,
      sections: entry.sections,
      source: entry.source,
    },
    pronunciations: entry.pronunciations,
    sourceLabel: "个人词库",
    synonyms: [],
    word: entry.word,
  };
}

export async function lookupPersonalVocabDefinition(
  rawWord: string,
): Promise<DictionaryEntry> {
  const lookupKey = normalizePersonalVocabLookupKey(rawWord);

  if (!lookupKey || !/^[a-z]+(?:['-][a-z]+)*$/i.test(lookupKey)) {
    throw new PersonalVocabLookupError(
      "Please provide a valid English word.",
      "INVALID_WORD",
      400,
    );
  }

  const entry = resolvePersonalVocabEntry(lookupKey, getLookupMap());

  if (!entry) {
    throw new PersonalVocabLookupError(
      "The personal vocabulary library could not find this word.",
      "WORD_NOT_FOUND",
      404,
    );
  }

  return toDictionaryEntry(entry);
}
