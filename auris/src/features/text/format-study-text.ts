import { splitIntoSentences } from "@/features/text/sentence-segmentation";

export function formatTextForSentenceStudy(input: string) {
  const paragraphs = input
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return input.trim();
  }

  return paragraphs
    .map((paragraph) => splitIntoSentences(paragraph).join("\n"))
    .join("\n\n");
}
