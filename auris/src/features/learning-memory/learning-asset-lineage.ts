import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";

export type LearningAssetLineageInput = {
  sessionId?: string | null;
  sourceNotePath?: string | null;
  sentences: SavedSentenceRecord[];
  words: SavedWordRecord[];
};

function uniquePaths(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].sort(
    (left, right) => left.localeCompare(right),
  );
}

/** Produces deterministic, display-safe provenance for a learning note. */
export function buildLearningAssetLineage(input: LearningAssetLineageInput) {
  return {
    sentenceIds: [...new Set(input.sentences.map((sentence) => sentence.id))].sort(),
    sourceNotePaths: uniquePaths([
      input.sourceNotePath,
      ...input.sentences.map((sentence) => sentence.sourceNotePath),
      ...input.words.map((word) => word.sourceNotePath),
    ]),
    sourceSessionId: input.sessionId?.trim() || null,
    wordIds: [...new Set(input.words.map((word) => word.word.trim().toLowerCase()))]
      .filter(Boolean)
      .sort(),
  };
}

export function buildLearningAssetLineageSection(input: LearningAssetLineageInput) {
  const lineage = buildLearningAssetLineage(input);
  const lines = ["## Asset Lineage", ""];
  if (lineage.sourceSessionId) lines.push(`- Session: ${lineage.sourceSessionId}`);
  if (lineage.sourceNotePaths.length > 0) {
    lines.push(...lineage.sourceNotePaths.map((path) => `- Source note: [[${path}]]`));
  }
  if (lineage.wordIds.length > 0) lines.push(`- Words: ${lineage.wordIds.join(", ")}`);
  if (lineage.sentenceIds.length > 0) lines.push(`- Sentences: ${lineage.sentenceIds.join(", ")}`);
  if (lines.length === 2) lines.push("- No linked learning assets yet.");
  return lines;
}
