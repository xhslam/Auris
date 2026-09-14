import {
  READING_WORD_CHAINS,
  type ReadingParagraph,
} from "@/features/reading/reading-fixtures";

const TOKEN_PATTERN = /([A-Za-z]+(?:'[A-Za-z]+)?|\s+|[^A-Za-z\s]+)/g;

export const READING_TRANSLATION_PLACEHOLDER =
  "译文待补充。先保留英文上下文，后续可接入翻译或 AI 分析。";
export const READING_ANALYSIS_PLACEHOLDER =
  "Imported locally. Add a note after reading to keep the paragraph context.";

export function tokenizeParagraph(text: string) {
  return text.match(TOKEN_PATTERN) ?? [text];
}

export function getWordCount(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function normalizeWord(token: string) {
  return token.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

/**
 * 去掉首尾标点，保留原始大小写，用于词卡标题展示。
 * 例：'"Consciousness,' → 'Consciousness'
 */
export function cleanDisplayToken(token: string) {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

/**
 * 把用户点击的词 / 划选的短语，归一化成查词库的 key。
 * - 单词：小写并去首尾标点（与 normalizeWord 一致）
 * - 短语（含空格）：仅 trim + 小写，保留内部空格，便于将来收录词组
 */
export function getLookupKey(term: string) {
  const trimmed = term.trim();
  if (!trimmed) {
    return "";
  }

  if (/\s/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return normalizeWord(trimmed);
}

export function getParagraphProgress(activeOrder: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((activeOrder / total) * 100);
}

/**
 * True when the block is mostly Chinese (CJK), used to pair
 * "English paragraph + blank line + Chinese translation".
 */
export function isMostlyChineseText(text: string) {
  const cjkCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return cjkCount > 0 && cjkCount >= latinCount;
}

function collectWordKeys(english: string) {
  const knownWordKeys = Array.from(
    new Set(
      tokenizeParagraph(english)
        .map(normalizeWord)
        .filter((wordKey) => Boolean(wordKey && READING_WORD_CHAINS[wordKey])),
    ),
  );

  return knownWordKeys.length > 0 ? knownWordKeys : ["momentum"];
}

/**
 * Split plain text into reading paragraphs.
 *
 * Bilingual convention (empty-line pairing):
 *   English paragraph
 *   <blank line>
 *   Chinese translation
 *
 * When the next blank-separated block is mostly Chinese and the current one
 * is not, they become one paragraph (left english / right translation).
 * Pure-English multi-paragraph files stay unpaired so old imports keep working.
 */
export function createParagraphsFromText(
  sourceId: string,
  text: string,
): ReadingParagraph[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((paragraphText) => paragraphText.trim())
    .filter(Boolean);

  const paragraphs: ReadingParagraph[] = [];
  let index = 0;

  while (index < blocks.length) {
    const english = blocks[index]!;
    const next = blocks[index + 1];
    const canPair =
      typeof next === "string" &&
      !isMostlyChineseText(english) &&
      isMostlyChineseText(next);

    const translation = canPair ? next : READING_TRANSLATION_PLACEHOLDER;
    const order = paragraphs.length + 1;

    paragraphs.push({
      analysis: READING_ANALYSIS_PLACEHOLDER,
      english,
      id: `${sourceId}-paragraph-${order}`,
      order,
      translation,
      wordKeys: collectWordKeys(english),
    });

    index += canPair ? 2 : 1;
  }

  return paragraphs;
}

/**
 * Serialize paragraphs back to the empty-line bilingual body format.
 * Placeholder translations are omitted so English-only sources stay clean.
 */
export function serializeReadingParagraphs(
  paragraphs: Array<Pick<ReadingParagraph, "english" | "translation">>,
) {
  return paragraphs
    .map((paragraph) => {
      const english = paragraph.english.trim();
      if (!english) {
        return "";
      }

      const translation = paragraph.translation.trim();
      if (
        !translation ||
        translation === READING_TRANSLATION_PLACEHOLDER
      ) {
        return english;
      }

      return `${english}\n\n${translation}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
