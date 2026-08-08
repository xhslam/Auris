import type { LearningMemoryContext } from "@/features/learning-memory/learning-memory-types";

export type BuildLearningAiContextPromptInput = LearningMemoryContext & {
  maxChars?: number;
};

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildWordLines(input: LearningMemoryContext) {
  if (input.words.length === 0) {
    return ["- None yet."];
  }

  return input.words
    .slice(0, 12)
    .map((word) => `- ${word.word}: ${word.definitions[0] ?? word.sourceLabel}`);
}

function buildSentenceLines(input: LearningMemoryContext) {
  if (input.sentences.length === 0) {
    return ["- None yet."];
  }

  return input.sentences
    .slice(0, 8)
    .map((sentence) => `- ${sentence.text}${sentence.translation ? ` (${sentence.translation})` : ""}`);
}

function buildRecallLines(input: LearningMemoryContext) {
  if (input.recallItems.length === 0) {
    return ["- No related memory found yet."];
  }

  return input.recallItems
    .slice(0, 8)
    .map((item) => `- ${item.title} - ${item.reasons.join("; ")}`);
}

export function buildLearningAiContextPrompt(
  input: BuildLearningAiContextPromptInput,
) {
  const prompt = [
    "You are helping me review an English shadowing session.",
    "Use the current material and related memory to suggest focused review, reusable expressions, and follow-up drills.",
    "",
    `Title: ${input.title}`,
    input.sourceNotePath ? `Source note: [[${input.sourceNotePath}]]` : "",
    "",
    "Current material:",
    input.materialText.trim() || "(empty)",
    "",
    "Saved words:",
    ...buildWordLines(input),
    "",
    "Saved sentences:",
    ...buildSentenceLines(input),
    "",
    "Related memory:",
    ...buildRecallLines(input),
    "",
    "Please answer with:",
    "1. Key pronunciation or rhythm risks.",
    "2. Expressions worth reusing.",
    "3. Three short follow-up drills.",
  ].join("\n");

  return truncate(prompt, input.maxChars ?? 6_000);
}
