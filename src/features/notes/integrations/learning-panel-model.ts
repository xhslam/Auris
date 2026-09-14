import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import {
  buildSentenceLearningSnippet,
  buildWordLearningSnippet,
  type LearningSnippet,
} from "@/features/notes/integrations/learning-snippets";

type BuildLearningPanelModelInput = {
  query: string;
  sentences: SavedSentenceRecord[];
  words: SavedWordRecord[];
};

export function buildLearningPanelModel(
  input: BuildLearningPanelModelInput,
): LearningSnippet[] {
  const snippets = [
    ...input.words.map(buildWordLearningSnippet),
    ...input.sentences.map(buildSentenceLearningSnippet),
  ].sort((left, right) => left.label.localeCompare(right.label));

  const normalizedQuery = input.query.trim().toLowerCase();

  if (!normalizedQuery) {
    return snippets;
  }

  return snippets.filter((snippet) => snippet.searchText.includes(normalizedQuery));
}
