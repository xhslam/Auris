export type DictionaryMeaning = {
  definitions: string[];
  lexicalCategory: string;
};

export type DictionaryEntry = {
  meanings: DictionaryMeaning[];
  personal?: {
    definition: string;
    fileName: string;
    sections: Array<{
      lines: string[];
      title: string;
    }>;
    source: {
      frequency?: number;
      pdfIndex?: number;
      sourceIndex?: number;
      sourceParagraph?: string;
    };
  };
  pronunciations: string[];
  sourceLabel: string;
  synonyms: string[];
  word: string;
};
