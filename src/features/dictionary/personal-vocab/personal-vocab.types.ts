export type PersonalVocabSection = {
  lines: string[];
  title: string;
};

export type PersonalVocabSourceInfo = {
  frequency?: number;
  pdfIndex?: number;
  sourceIndex?: number;
  sourceParagraph?: string;
};

export type PersonalVocabEntry = {
  definition: string;
  fileName: string;
  lookupKey: string;
  partOfSpeech: string;
  pronunciations: string[];
  sections: PersonalVocabSection[];
  source: PersonalVocabSourceInfo;
  word: string;
};

export type PersonalVocabIndex = {
  entries: PersonalVocabEntry[];
  entryCount: number;
};
