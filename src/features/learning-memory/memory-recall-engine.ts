import type {
  BuildRelatedMemoryInput,
  LearningMemoryNoteRecord,
  LearningMemoryRecallItem,
  LearningMemorySessionRecord,
} from "@/features/learning-memory/learning-memory-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "will",
  "with",
  "you",
]);

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return Array.from(value.toLowerCase().matchAll(/[a-z0-9]+(?:['-][a-z0-9]+)?/g))
    .map((match) => match[0])
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(value: string) {
  return Array.from(new Set(tokenize(value)));
}

function truncate(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function compareRecallItems(
  left: LearningMemoryRecallItem,
  right: LearningMemoryRecallItem,
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return left.title.localeCompare(right.title);
}

function createWordRecall(
  materialTokens: Set<string>,
  word: SavedWordRecord,
): LearningMemoryRecallItem | null {
  const normalizedWord = word.word.trim().toLowerCase();

  if (!normalizedWord || !materialTokens.has(normalizedWord)) {
    return null;
  }

  return {
    id: `word:${normalizedWord}`,
    preview: word.definitions[0] ?? word.sourceLabel,
    reasons: [`contains saved word: ${normalizedWord}`],
    score: 80,
    targetId: normalizedWord,
    title: word.word,
    type: "word",
  };
}

function findOverlappingPhrase(
  materialTokenText: string,
  sourceText: string,
  minimumLength = 3,
) {
  const sourceTokens = tokenize(sourceText);

  for (let size = Math.min(6, sourceTokens.length); size >= minimumLength; size -= 1) {
    for (let index = 0; index <= sourceTokens.length - size; index += 1) {
      const phrase = sourceTokens.slice(index, index + size).join(" ");

      if (materialTokenText.includes(phrase)) {
        return phrase;
      }
    }
  }

  return null;
}

function createSentenceRecall(
  materialTokenText: string,
  sentence: SavedSentenceRecord,
): LearningMemoryRecallItem | null {
  const phrase = findOverlappingPhrase(materialTokenText, sentence.text);

  if (!phrase) {
    return null;
  }

  return {
    id: `sentence:${sentence.id}`,
    preview: sentence.translation || sentence.sourceLabel,
    reasons: [`overlaps saved sentence: ${phrase}`],
    score: 95,
    targetId: sentence.id,
    title: sentence.text,
    type: "sentence",
  };
}

function getOverlappingTokens(materialTokens: Set<string>, value: string) {
  return uniqueTokens(value).filter((token) => materialTokens.has(token));
}

function createNoteRecall(
  materialTokens: Set<string>,
  note: LearningMemoryNoteRecord,
): LearningMemoryRecallItem | null {
  const reasons: string[] = [];
  let score = 0;
  const titleOverlap = getOverlappingTokens(materialTokens, note.title);
  const tagOverlap = note.tags
    .map((tag) => tag.toLowerCase())
    .filter((tag) => materialTokens.has(tag));
  const bodyOverlap = getOverlappingTokens(materialTokens, note.content)
    .filter((token) => !titleOverlap.includes(token) && !tagOverlap.includes(token))
    .slice(0, 3);

  if (titleOverlap.length > 0) {
    score += 35;
    reasons.push(`note title overlaps: ${titleOverlap.join(", ")}`);
  }

  if (tagOverlap.length > 0) {
    score += 30;
    tagOverlap.forEach((tag) => reasons.push(`tag: ${tag}`));
  }

  if (bodyOverlap.length > 0) {
    score += bodyOverlap.length * 15;
    reasons.push(`note body overlaps: ${bodyOverlap.join(", ")}`);
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    id: `note:${note.path}`,
    preview: truncate(note.content),
    reasons,
    score,
    targetPath: note.path,
    title: note.title || note.path,
    type: "note",
  };
}

function createSessionRecall(
  materialTokens: Set<string>,
  session: LearningMemorySessionRecord,
): LearningMemoryRecallItem | null {
  const titleOverlap = getOverlappingTokens(materialTokens, session.title);

  if (titleOverlap.length === 0) {
    return null;
  }

  return {
    id: `session:${session.id}`,
    preview: session.title,
    reasons: [`session title overlaps: ${titleOverlap.join(", ")}`],
    score: 40,
    targetId: session.id,
    title: session.title,
    type: "session",
  };
}

export function buildRelatedMemory(
  input: BuildRelatedMemoryInput,
): LearningMemoryRecallItem[] {
  const normalizedMaterial = normalizeText(input.materialText);

  if (!normalizedMaterial) {
    return [];
  }

  const materialTokens = new Set(tokenize(normalizedMaterial));
  const materialTokenText = Array.from(materialTokens).join(" ");

  if (materialTokens.size === 0) {
    return [];
  }

  return [
    ...input.sentences
      .map((sentence) => createSentenceRecall(materialTokenText, sentence))
      .filter((item): item is LearningMemoryRecallItem => item !== null),
    ...input.words
      .map((word) => createWordRecall(materialTokens, word))
      .filter((item): item is LearningMemoryRecallItem => item !== null),
    ...input.notes
      .map((note) => createNoteRecall(materialTokens, note))
      .filter((item): item is LearningMemoryRecallItem => item !== null),
    ...(input.sessions ?? [])
      .map((session) => createSessionRecall(materialTokens, session))
      .filter((item): item is LearningMemoryRecallItem => item !== null),
  ].sort(compareRecallItems);
}
