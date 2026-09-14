import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";

export type LearningSnippet = {
  id: string;
  kind: "sentence" | "word";
  label: string;
  markdown: string;
  searchText: string;
};

function joinMarkdownSections(sections: string[]) {
  return sections.filter(Boolean).join("\n\n").trim();
}

export function buildWordLearningSnippet(record: SavedWordRecord): LearningSnippet {
  return {
    id: `word:${record.word.toLowerCase()}`,
    kind: "word",
    label: record.word,
    markdown: joinMarkdownSections([
      `## Word · ${record.word}`,
      `- Lexical category: ${record.lexicalCategory}`,
      ...record.definitions.map((definition) => `- ${definition}`),
      record.synonyms.length > 0 ? `- Synonyms: ${record.synonyms.join(", ")}` : "",
      `> Source: ${record.sourceLabel}`,
    ]),
    searchText: [record.word, record.lexicalCategory, record.sourceLabel, ...record.definitions, ...record.synonyms]
      .join(" ")
      .toLowerCase(),
  };
}

export function buildSentenceLearningSnippet(record: SavedSentenceRecord): LearningSnippet {
  return {
    id: `sentence:${record.id}`,
    kind: "sentence",
    label: record.text,
    markdown: joinMarkdownSections([
      "## Sentence",
      `> ${record.text}`,
      record.translation ? `- Translation: ${record.translation}` : "",
      `- Source: ${record.sourceLabel}`,
    ]),
    searchText: [record.text, record.translation, record.sourceLabel].join(" ").toLowerCase(),
  };
}
