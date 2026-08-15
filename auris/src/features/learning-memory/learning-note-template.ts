import type {
  LearningMemoryContext,
  LearningMemoryRecallItem,
} from "@/features/learning-memory/learning-memory-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import { buildLearningAssetLineageSection } from "@/features/learning-memory/learning-asset-lineage";

export type BuildLearningNoteMarkdownInput = LearningMemoryContext & {
  createdAt: string;
};

function escapeYamlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildFrontmatter(input: BuildLearningNoteMarkdownInput) {
  return [
    "---",
    "type: learning-session",
    input.sessionId ? `sourceSessionId: "${escapeYamlString(input.sessionId)}"` : "",
    input.sourceNotePath ? `sourceNote: "${escapeYamlString(input.sourceNotePath)}"` : "",
    `createdAt: "${escapeYamlString(input.createdAt)}"`,
    "tags:",
    "  - english",
    "  - shadowing",
    "  - learning-session",
    "---",
  ].filter(Boolean);
}

function buildSavedWordsSection(words: SavedWordRecord[]) {
  if (words.length === 0) {
    return ["## Saved Words", "", "No saved words yet."];
  }

  return [
    "## Saved Words",
    "",
    ...words.map((word) => {
      const definition = word.definitions[0] ?? word.sourceLabel;
      const synonyms =
        word.synonyms.length > 0 ? ` Synonyms: ${word.synonyms.join(", ")}.` : "";
      const sourceNote = word.sourceNotePath
        ? ` Source note: [[${word.sourceNotePath}]].`
        : "";

      return `- **${word.word}** _(${word.lexicalCategory})_ - ${definition}${synonyms}${sourceNote}`;
    }),
  ];
}

function buildSavedSentencesSection(sentences: SavedSentenceRecord[]) {
  if (sentences.length === 0) {
    return ["## Saved Sentences", "", "No saved sentences yet."];
  }

  return [
    "## Saved Sentences",
    "",
    ...sentences.flatMap((sentence) => [
      `> ${sentence.text}`,
      sentence.translation ? `- Translation: ${sentence.translation}` : "",
      `- Source: ${sentence.sourceLabel}`,
      sentence.sourceNotePath ? `- Source note: [[${sentence.sourceNotePath}]]` : "",
      "",
    ]),
  ].filter((line, index, lines) => line || lines[index + 1] !== "");
}

function getWikiTitle(item: LearningMemoryRecallItem) {
  return item.title.replace(/^\[\[|\]\]$/g, "");
}

function buildRelatedMemoryLine(item: LearningMemoryRecallItem) {
  if (item.type === "note") {
    return `- [[${getWikiTitle(item)}]]`;
  }

  if (item.type === "sentence") {
    return `- Saved sentence: ${item.title}`;
  }

  if (item.type === "word") {
    return `- Saved word: ${item.title}`;
  }

  return `- Previous session: ${item.title}`;
}

function buildRelatedMemorySection(recallItems: LearningMemoryRecallItem[]) {
  if (recallItems.length === 0) {
    return ["## Related Memory", "", "No related memory found yet."];
  }

  return [
    "## Related Memory",
    "",
    ...recallItems.slice(0, 8).map(buildRelatedMemoryLine),
  ];
}

function buildSourceSection(input: BuildLearningNoteMarkdownInput) {
  const lines = [
    `# ${input.title}`,
    "",
    "## Source",
    "",
  ];

  if (input.sourceNotePath) {
    lines.push(`Source note: [[${input.sourceNotePath}]]`);
  }

  lines.push(input.materialText.trim());
  return lines;
}

function joinSections(sections: string[][]) {
  return sections
    .map((section) => section.join("\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildLearningNoteMarkdown(
  input: BuildLearningNoteMarkdownInput,
) {
  return `${joinSections([
    buildFrontmatter(input),
    buildSourceSection(input),
    buildSavedWordsSection(input.words),
    buildSavedSentencesSection(input.sentences),
    buildLearningAssetLineageSection({
      sessionId: input.sessionId,
      sourceNotePath: input.sourceNotePath,
      sentences: input.sentences,
      words: input.words,
    }),
    buildRelatedMemorySection(input.recallItems),
    [
      "## Review",
      "",
      "- What sounded difficult?",
      "- Which expression should be reused?",
      "- What should be repeated next time?",
    ],
  ])}\n`;
}
