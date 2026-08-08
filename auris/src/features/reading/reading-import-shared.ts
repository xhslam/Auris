import {
  createParagraphsFromText,
  getWordCount,
} from "@/features/reading/reading-text";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

export function deriveReadingTitle(
  fileName: string,
  text: string,
  extensionPattern: RegExp,
) {
  const baseName = fileName.replace(extensionPattern, "").trim();

  if (baseName) {
    return baseName;
  }

  const firstLine = text
    .split(/\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.slice(0, 80) || "Untitled reading";
}

/**
 * Shared builder: plain text → ReadingSource, matching the Word import pipeline.
 */
export function buildReadingSourceFromPlainText(options: {
  category?: ReadingSource["category"];
  fileName: string;
  idPrefix: string;
  text: string;
  titleExtensionPattern: RegExp;
}): ReadingSource {
  const trimmed = options.text.trim();

  if (!trimmed) {
    throw new Error("这个文件里没有可导入的文字。");
  }

  const sourceId = `${options.idPrefix}-${Date.now()}`;
  const paragraphs = createParagraphsFromText(sourceId, trimmed);

  if (paragraphs.length === 0) {
    throw new Error("这个文件里没有可导入的段落。");
  }

  const wordCount = getWordCount(trimmed);

  return {
    category: options.category ?? "article",
    estimatedMinutes: Math.max(1, Math.ceil(wordCount / 180)),
    id: sourceId,
    kicker: options.fileName,
    paragraphs,
    progress: 0,
    title: deriveReadingTitle(
      options.fileName,
      trimmed,
      options.titleExtensionPattern,
    ),
  };
}
