import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";

type WordPosLookup = {
  def?: string;
  gloss?: string;
  pos?: string;
  synonyms?: string[];
};

type WordPosInstance = {
  lookup(word: string): Promise<WordPosLookup[]>;
};

type WordPosConstructor = new () => WordPosInstance;
const WordPosClient = require("wordpos") as WordPosConstructor;

export class WordnetLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_WORD" | "LOOKUP_FAILED" | "WORD_NOT_FOUND",
    public readonly status: number,
  ) {
    super(message);
  }
}

const wordpos = new WordPosClient();

function normalizeWord(rawWord: string) {
  return rawWord.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/gi, "");
}

function mapPartOfSpeech(pos?: string) {
  switch (pos) {
    case "n":
      return "noun";
    case "v":
      return "verb";
    case "a":
    case "s":
      return "adjective";
    case "r":
      return "adverb";
    default:
      return "meaning";
  }
}

function extractDefinition(lookup: WordPosLookup) {
  if (lookup.def?.trim()) {
    return lookup.def.trim();
  }

  if (!lookup.gloss) {
    return null;
  }

  const [firstChunk] = lookup.gloss.split(/[;:]/);
  return firstChunk?.trim() || null;
}

function normalizeSynonym(value: string) {
  return value.replace(/_/g, " ").trim();
}

function toDictionaryEntry(word: string, lookups: WordPosLookup[]): DictionaryEntry | null {
  const groupedMeanings = new Map<string, string[]>();
  const synonyms = new Set<string>();

  for (const lookup of lookups) {
    const lexicalCategory = mapPartOfSpeech(lookup.pos);
    const definition = extractDefinition(lookup);

    if (!definition) {
      continue;
    }

    const definitions = groupedMeanings.get(lexicalCategory) ?? [];

    if (!definitions.includes(definition)) {
      definitions.push(definition);
      groupedMeanings.set(lexicalCategory, definitions);
    }

    for (const synonym of lookup.synonyms ?? []) {
      const normalizedSynonym = normalizeSynonym(synonym);

      if (
        normalizedSynonym &&
        normalizedSynonym.toLowerCase() !== word.toLowerCase()
      ) {
        synonyms.add(normalizedSynonym);
      }
    }
  }

  const meanings = Array.from(groupedMeanings.entries())
    .map(([lexicalCategory, definitions]) => ({
      definitions: definitions.slice(0, 4),
      lexicalCategory,
    }))
    .filter((meaning) => meaning.definitions.length > 0)
    .slice(0, 4);

  if (meanings.length === 0) {
    return null;
  }

  return {
    meanings,
    pronunciations: [],
    sourceLabel: "WordNet Offline",
    synonyms: Array.from(synonyms).slice(0, 8),
    word,
  };
}

export async function lookupOfflineDefinition(rawWord: string): Promise<DictionaryEntry> {
  const normalizedWord = normalizeWord(rawWord);

  if (!normalizedWord || !/^[a-z]+(?:['-][a-z]+)*$/i.test(normalizedWord)) {
    throw new WordnetLookupError("Please provide a valid English word.", "INVALID_WORD", 400);
  }

  try {
    const lookups = await wordpos.lookup(normalizedWord);
    const entry = toDictionaryEntry(normalizedWord, lookups);

    if (!entry) {
      throw new WordnetLookupError(
        "The offline dictionary could not find this word.",
        "WORD_NOT_FOUND",
        404,
      );
    }

    return entry;
  } catch (error) {
    if (error instanceof WordnetLookupError) {
      throw error;
    }

    throw new WordnetLookupError(
      "Offline dictionary lookup failed.",
      "LOOKUP_FAILED",
      500,
    );
  }
}
