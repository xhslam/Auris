import type {
  ReadingExamBlock,
  ReadingExamBlockKind,
  ReadingExamSection,
  ReadingExamType,
} from "@/features/reading/reading-fixtures";
import {
  createParagraphsFromText,
  getWordCount,
  READING_TRANSLATION_PLACEHOLDER,
} from "@/features/reading/reading-text";
import type { ReadingParagraph, ReadingSource } from "@/features/reading/reading-fixtures";

const EXAM_TYPE_HEADING =
  /^##\s*题型\s*[:：]\s*(.+?)\s*$/gm;

const EXAM_TYPE_ALIASES: Record<string, ReadingExamType> = {
  完形: "cloze",
  完形填空: "cloze",
  "use of english": "cloze",
  阅读: "reading",
  阅读理解: "reading",
  "新题型-排序": "new_order",
  新题型排序: "new_order",
  排序: "new_order",
  "新题型-七选五": "new_seven_five",
  新题型七选五: "new_seven_five",
  七选五: "new_seven_five",
  "7选5": "new_seven_five",
  翻译: "translation",
  "写作-应用文": "writing_a",
  写作应用文: "writing_a",
  应用文: "writing_a",
  "写作-大作文": "writing_b",
  写作大作文: "writing_b",
  大作文: "writing_b",
  写作: "writing_b",
};

const SECTION_KIND_ALIASES: Record<string, ReadingExamBlockKind> = {
  directions: "directions",
  说明: "directions",
  篇章: "passage",
  passage: "passage",
  text: "passage",
  选项: "options",
  options: "options",
  题目: "questions",
  questions: "questions",
  答题链: "chain",
  chain: "chain",
  段落库: "paragraphs",
  paragraphs: "paragraphs",
  划线句: "underlined",
  underlined: "underlined",
  参考答案: "answers",
  答案: "answers",
  answers: "answers",
  来信: "letter",
  letter: "letter",
  图表说明: "chart",
  chart: "chart",
  要求: "prompt",
  prompt: "prompt",
  范文: "model",
  model: "model",
  参考译文: "underlined",
  原文: "passage",
};

export function stripMarkdownFrontmatter(markdown: string) {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return text;
  }

  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return text;
  }

  return text.slice(end + 4).replace(/^\r?\n/, "");
}

export function resolveExamTypeLabel(label: string): ReadingExamType | null {
  const trimmed = label.trim();
  if (EXAM_TYPE_ALIASES[trimmed]) {
    return EXAM_TYPE_ALIASES[trimmed]!;
  }
  return EXAM_TYPE_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function hasReadingExamMarkers(markdown: string) {
  const body = stripMarkdownFrontmatter(markdown);
  return /^##\s*题型\s*[:：]\s*.+/m.test(body);
}

function resolveBlockKind(heading: string): ReadingExamBlockKind {
  const trimmed = heading.trim();
  const key = trimmed.toLowerCase();
  if (SECTION_KIND_ALIASES[key] || SECTION_KIND_ALIASES[trimmed]) {
    return SECTION_KIND_ALIASES[key] ?? SECTION_KIND_ALIASES[trimmed]!;
  }
  if (/^text\s*\d+/i.test(trimmed)) {
    return "passage";
  }
  return "other";
}

function splitBilingualBlock(text: string): { english: string; translation?: string } {
  const paragraphs = createParagraphsFromText("tmp", text);
  if (paragraphs.length === 1) {
    const only = paragraphs[0]!;
    if (only.translation !== READING_TRANSLATION_PLACEHOLDER) {
      return { english: only.english, translation: only.translation };
    }
    return { english: only.english };
  }

  // Multiple pairs: keep as one english blob with blank lines; attach first translation if any.
  const englishParts: string[] = [];
  const translationParts: string[] = [];
  for (const paragraph of paragraphs) {
    englishParts.push(paragraph.english);
    if (paragraph.translation !== READING_TRANSLATION_PLACEHOLDER) {
      translationParts.push(paragraph.translation);
    }
  }

  return {
    english: englishParts.join("\n\n"),
    ...(translationParts.length > 0
      ? { translation: translationParts.join("\n\n") }
      : {}),
  };
}

function parseInnerBlocks(body: string): ReadingExamBlock[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  const headingPattern = /^###\s+(.+?)\s*$/gm;
  const matches = [...trimmed.matchAll(headingPattern)];

  if (matches.length === 0) {
    const pair = splitBilingualBlock(trimmed);
    return [
      {
        english: pair.english,
        kind: "other",
        ...(pair.translation ? { translation: pair.translation } : {}),
      },
    ];
  }

  const blocks: ReadingExamBlock[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const heading = match[1] ?? "其他";
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1]!.index ?? trimmed.length) : trimmed.length;
    const content = trimmed.slice(start, end).trim();
    if (!content) {
      continue;
    }
    const pair = splitBilingualBlock(content);
    blocks.push({
      english: pair.english,
      kind: resolveBlockKind(heading),
      ...(pair.translation ? { translation: pair.translation } : {}),
    });
  }

  return blocks;
}

/**
 * Parse markdown that uses `## 题型: …` markers into exam sections.
 * Returns null when no valid exam markers are present.
 */
export function parseReadingExamMarkdown(markdown: string): ReadingExamSection[] | null {
  const body = stripMarkdownFrontmatter(markdown).trim();
  if (!body) {
    return null;
  }

  EXAM_TYPE_HEADING.lastIndex = 0;
  const matches = [...body.matchAll(EXAM_TYPE_HEADING)];
  if (matches.length === 0) {
    return null;
  }

  const sections: ReadingExamSection[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const label = (match[1] ?? "").trim();
    const type = resolveExamTypeLabel(label);
    if (!type) {
      continue;
    }

    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length ? (matches[index + 1]!.index ?? body.length) : body.length;
    const sectionBody = body.slice(start, end);
    const blocks = parseInnerBlocks(sectionBody);
    if (blocks.length === 0) {
      continue;
    }

    sections.push({ blocks, label, type });
  }

  return sections.length > 0 ? sections : null;
}

function paragraphsFromExamSections(
  sourceId: string,
  sections: ReadingExamSection[],
): ReadingParagraph[] {
  const chunks: string[] = [];

  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind === "answers" || block.kind === "directions") {
        continue;
      }
      if (block.translation) {
        chunks.push(`${block.english}\n\n${block.translation}`);
      } else {
        chunks.push(block.english);
      }
    }
  }

  const text = chunks.join("\n\n").trim();
  if (!text) {
    return createParagraphsFromText(
      sourceId,
      sections.map((section) => section.label).join("\n\n"),
    );
  }

  return createParagraphsFromText(sourceId, text);
}

export function buildReadingSourceFromExamMarkdown(options: {
  category?: ReadingSource["category"];
  fileName: string;
  idPrefix: string;
  markdown: string;
  sections: ReadingExamSection[];
  titleExtensionPattern: RegExp;
}): ReadingSource {
  const sourceId = `${options.idPrefix}-${Date.now()}`;
  const paragraphs = paragraphsFromExamSections(sourceId, options.sections);
  const wordCount = paragraphs.reduce(
    (total, paragraph) => total + getWordCount(paragraph.english),
    0,
  );
  const titleBase = options.fileName.replace(options.titleExtensionPattern, "").trim();
  const firstLabel = options.sections[0]?.label;

  return {
    category: options.category ?? "exam",
    estimatedMinutes: Math.max(1, Math.ceil(Math.max(wordCount, 1) / 180)),
    examSections: options.sections,
    format: "text",
    id: sourceId,
    kicker: options.fileName,
    paragraphs,
    progress: 0,
    title: titleBase || firstLabel || "Exam reading",
  };
}

export const READING_EXAM_TYPE_LABELS: Record<ReadingExamType, string> = {
  cloze: "完形填空",
  reading: "阅读理解",
  new_order: "新题型-排序",
  new_seven_five: "新题型-七选五",
  translation: "翻译",
  writing_a: "写作-应用文",
  writing_b: "写作-大作文",
};

const BLOCK_HEADING_LABELS: Record<ReadingExamBlockKind, string> = {
  directions: "Directions",
  passage: "篇章",
  options: "选项",
  questions: "题目",
  chain: "答题链",
  paragraphs: "段落库",
  underlined: "划线句",
  answers: "参考答案",
  letter: "来信",
  chart: "图表说明",
  prompt: "要求",
  model: "范文",
  other: "内容",
};

/** Serialize exam sections back to marker markdown for vault persistence. */
export function serializeReadingExamSections(sections: ReadingExamSection[]) {
  return sections
    .map((section) => {
      const header = `## 题型: ${READING_EXAM_TYPE_LABELS[section.type] ?? section.label}`;
      const body = section.blocks
        .map((block) => {
          const title = BLOCK_HEADING_LABELS[block.kind] ?? "内容";
          const content = block.translation
            ? `${block.english}\n\n${block.translation}`
            : block.english;
          return `### ${title}\n\n${content}`;
        })
        .join("\n\n");
      return `${header}\n\n${body}`;
    })
    .join("\n\n");
}
