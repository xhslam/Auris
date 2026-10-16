import type { PersonalVocabEntry } from "../src/features/dictionary/personal-vocab/personal-vocab.types";

declare namespace personalVocabSync {
  function normalizeLookupKey(value: string): string;
  function findWordHeading(lines: string[], fileName: string): { heading: string; index: number };
  function parseEntry(filePath: string, fileName: string): PersonalVocabEntry;
  function buildPersonalVocabIndex(sourceDir: string): {
    duplicateKeys: string[];
    entries: PersonalVocabEntry[];
  };
}
export = personalVocabSync;
