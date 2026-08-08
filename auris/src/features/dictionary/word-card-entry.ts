import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";

export type WordCardSection = {
  lines: string[];
  title: string;
};

export type WordCardEntry = {
  definition: string;
  examples: string[];
  morphemes?: string[];
  mnemonic?: string;
  partOfSpeech?: string;
  phonetic?: string;
  relatedWords: string[];
  sections: WordCardSection[];
  word: string;
};

export function dictionaryEntryToWordCardEntry(
  entry: DictionaryEntry | null,
): WordCardEntry | null {
  if (!entry) {
    return null;
  }

  const firstMeaning = entry.meanings[0];

  return {
    definition: entry.personal?.definition ?? firstMeaning?.definitions[0] ?? "",
    examples: [],
    partOfSpeech: firstMeaning?.lexicalCategory,
    phonetic: entry.pronunciations[0],
    relatedWords: entry.synonyms,
    sections: entry.personal?.sections ?? [],
    word: entry.word,
  };
}
