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

const LEGACY_EXAM_HEADING_ALIASES = [
  "阅读理解",
  "新题型-排序",
  "新题型-七选五",
  "翻译",
  "写作-应用文",
  "写作-大作文",
  "作文",
  "大作文",
  "小作文",
] as const;

const EXAM_TYPE_ALIASES: Record<string, ReadingExamType> = {
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
  小作文: "writing_a",
  "写作-大作文": "writing_b",
  写作大作文: "writing_b",
  大作文: "writing_b",
  写作: "writing_b",
  作文: "writing_b",
};

const RETIRED_CLOZE_HEADING =
  /^##[ \t]*(?:题型[ \t]*[:：][ \t]*)?完形填空[ \t]*$/gm;

const SECTION_KIND_ALIASES: Record<string, ReadingExamBlockKind> = {
  directions: "directions",
  说明: "directions",
  一分钟读懂全文: "overview",
  篇章: "passage",
  passage: "passage",
  text: "passage",
  原文与逐段理解: "passage",
  逐句翻译和讲解: "passage",
  全文逻辑地图: "logic_map",
  长难句精讲: "sentences",
  关键词与表达: "vocabulary",
  选项: "options",
  options: "options",
  题目: "questions",
  questions: "questions",
  阅读理解题精讲: "questions",
  "文章中的「同义替换」": "synonyms",
  容易误解的地方: "pitfalls",
  用大白话重新讲一遍文章: "retelling",
  读完这篇文章真正需要记住什么: "takeaways",
  最终压缩: "summary",
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

/**
 * Keep old study files readable while removing the retired cloze presentation.
 * A cloze heading is an input compatibility alias only: from this point on it
 * is indistinguishable from a reading-comprehension section.
 */
function normalizeLegacyExamHeading(markdown: string) {
  const canonicalMarkdown = markdown.replace(
    RETIRED_CLOZE_HEADING,
    "## 题型: 阅读理解",
  );
  const legacyPattern = new RegExp(
    `^##\\s*(${LEGACY_EXAM_HEADING_ALIASES.join("|")})\\s*$`,
    "gm",
  );
  return canonicalMarkdown.replace(legacyPattern, "## 题型: $1");
}

export function resolveExamTypeLabel(label: string): ReadingExamType | null {
  const trimmed = label.trim();
  if (EXAM_TYPE_ALIASES[trimmed]) {
    return EXAM_TYPE_ALIASES[trimmed]!;
  }
  return EXAM_TYPE_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function hasReadingExamMarkers(markdown: string) {
  const body = normalizeLegacyExamHeading(stripMarkdownFrontmatter(markdown));
  EXAM_TYPE_HEADING.lastIndex = 0;
  return [...body.matchAll(EXAM_TYPE_HEADING)].some((match) =>
    resolveExamTypeLabel(match[1] ?? "") !== null,
  );
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
  const trimmed = text.trim();
  const isSentenceStudyBlock =
    /^\*\*英文[：:]?\*\*\s*$/m.test(trimmed) &&
    /^\*\*中文[：:]?\*\*\s*$/m.test(trimmed) &&
    /^\*\*(?:句子结构|语法现象|常见用法|词汇与表达|综合点评)[：:]?\*\*\s*$/m.test(trimmed);

  // Sentence-study labels are structural markers, not bilingual paragraph
  // delimiters. Keep the complete block intact so the interactive reader can
  // place the English/Chinese lead above one collapsed explanation panel.
  if (isSentenceStudyBlock) {
    return { english: trimmed };
  }

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
      title: heading.trim(),
      ...(pair.translation ? { translation: pair.translation } : {}),
    });
  }

  return blocks;
}

/**
 * Composition notes are usually authored as a handout: one level-two heading
 * per paragraph (Introduction / Body / Conclusion), with English, Chinese and
 * vocabulary notes nested below it. Keep that hierarchy intact instead of
 * flattening the bilingual labels into generic exam cards.
 */
function parseCompositionBlocks(body: string): ReadingExamBlock[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  const levelTwoHeadings = [...trimmed.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (levelTwoHeadings.length === 0) {
    return parseInnerBlocks(trimmed);
  }

  const blocks: ReadingExamBlock[] = [];
  const preface = trimmed.slice(0, levelTwoHeadings[0]?.index ?? 0).trim();
  if (preface) {
    blocks.push({ english: preface, kind: "prompt", title: "写作要求" });
  }

  levelTwoHeadings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = levelTwoHeadings[index + 1]?.index ?? trimmed.length;
    const content = trimmed.slice(start, end).trim();
    if (!content) return;
    blocks.push({
      english: content,
      kind: "model",
      title: (heading[1] ?? `Paragraph ${index + 1}`).trim(),
    });
  });

  return blocks;
}

const READING_STUDY_TEMPLATE: Array<{
  kind: ReadingExamBlockKind;
  number: number;
  titles: string[];
}> = [
  { kind: "overview", number: 0, titles: ["一分钟读懂全文"] },
  {
    kind: "passage",
    number: 1,
    titles: ["逐句翻译和讲解", "原文与逐段理解"],
  },
  { kind: "logic_map", number: 2, titles: ["全文逻辑地图"] },
  { kind: "sentences", number: 3, titles: ["长难句精讲"] },
  { kind: "vocabulary", number: 4, titles: ["关键词与表达"] },
  { kind: "questions", number: 5, titles: ["阅读理解题精讲"] },
  { kind: "synonyms", number: 6, titles: ["文章中的「同义替换」"] },
  { kind: "pitfalls", number: 7, titles: ["容易误解的地方"] },
  { kind: "retelling", number: 8, titles: ["用大白话重新讲一遍文章"] },
  { kind: "takeaways", number: 9, titles: ["读完这篇文章真正需要记住什么"] },
  { kind: "summary", number: 10, titles: ["最终压缩"] },
];

function normalizeStudyTitle(title: string) {
  return title.replace(/\s+/g, "").replace(/[“”]/g, '"');
}

function parseReadingStudyTemplate(body: string): ReadingExamSection | null {
  const headings = [...body.matchAll(/^##\s+(\d{1,2})\.\s*(.+?)\s*$/gm)];
  if (headings.length === 0) return null;

  const blocks: ReadingExamBlock[] = [];
  for (const template of READING_STUDY_TEMPLATE) {
    const index = headings.findIndex((heading) => {
      const number = Number(heading[1]);
      const title = normalizeStudyTitle(heading[2] ?? "");
      return number === template.number && template.titles.some(
        (candidate) => title === normalizeStudyTitle(candidate),
      );
    });
    if (index === -1) return null;

    const heading = headings[index]!;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    blocks.push({
      english: body.slice(start, end).trim() || "本部分暂无内容。",
      kind: template.kind,
    });
  }

  return { blocks, label: "考研英语一阅读理解精读", type: "reading" };
}

type DetailedReadingPart = {
  body: string;
  title: string;
};

function splitDetailedReadingParts(body: string): DetailedReadingPart[] {
  const headings = [...body.matchAll(/^##\s+(?:\d+[.)]\s*)?(.+?)\s*$/gm)];
  return headings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    return {
      body: body.slice(start, end).trim(),
      title: (heading[1] ?? "").trim().toLowerCase(),
    };
  });
}

/**
 * Parse the long-form handout used by the postgraduate-English archive:
 * Basic Info → Original Text → sentence-by-sentence notes → questions.
 * The outer `## 题型: 阅读理解` marker remains mandatory.
 */
function parseDetailedReadingHandout(body: string): ReadingExamBlock[] | null {
  const parts = splitDetailedReadingParts(body);
  const find = (...titles: string[]) => parts.find((part) => titles.includes(part.title));
  const sentenceStudy = find("逐句翻译和讲解");
  const original = find("original text", "原文");
  const questions = find("questions", "题目");

  if (!sentenceStudy?.body || !original?.body || !questions?.body) return null;

  const blocks: ReadingExamBlock[] = [];
  const push = (kind: ReadingExamBlockKind, ...titles: string[]) => {
    const part = find(...titles);
    if (part?.body) blocks.push({ english: part.body, kind });
  };

  push("overview", "基本信息", "basic information");
  blocks.push({ english: sentenceStudy.body, kind: "passage" });
  push("logic_map", "文章结构", "structure");
  push("sentences", "长难句解析", "长难句精讲");

  const vocabularyParts = [
    find("core vocabulary", "核心词汇"),
    find("useful expressions", "实用表达"),
  ].filter((part): part is DetailedReadingPart => Boolean(part?.body));
  if (vocabularyParts.length > 0) {
    blocks.push({
      english: vocabularyParts
        .map((part) => `### ${part.title}\n\n${part.body}`)
        .join("\n\n"),
      kind: "vocabulary",
    });
  }

  blocks.push({ english: questions.body, kind: "questions" });
  push("answers", "question analysis", "题目解析");
  push("synonyms", "文章中的「同义替换」");
  push("pitfalls", "容易误解的地方");
  push("retelling", "用大白话重新讲一遍这篇文章", "用大白话重新讲一遍文章");

  const takeawayParts = [
    find("reading takeaways"),
    find("读完这篇文章真正需要记住什么"),
  ].filter((part): part is DetailedReadingPart => Boolean(part?.body));
  if (takeawayParts.length > 0) {
    blocks.push({
      english: takeawayParts.map((part) => part.body).join("\n\n---\n\n"),
      kind: "takeaways",
    });
  }

  return blocks;
}

type RichReadingSection = {
  body: string;
  kind: "analysis" | "original" | "questions" | "structure" | "translation";
};

function richReadingSectionKind(heading: string): RichReadingSection["kind"] | null {
  const normalized = heading
    .replace(/^\d+[.)、]?\s*/, "")
    .trim()
    .toLowerCase();

  if (normalized === "original text" || normalized === "原文") return "original";
  if (normalized === "全文翻译" || normalized === "translation") return "translation";
  if (normalized === "文章结构" || normalized === "structure") return "structure";
  if (normalized === "questions" || normalized === "题目") return "questions";
  if (normalized === "question analysis" || normalized === "题目解析") return "analysis";
  return null;
}

function splitRichReadingSections(body: string): RichReadingSection[] {
  const headings = [...body.matchAll(/^#{1,2}\s+(.+?)\s*$/gm)]
    .map((match) => ({
      end: (match.index ?? 0) + match[0].length,
      index: match.index ?? 0,
      kind: richReadingSectionKind(match[1] ?? ""),
    }))
    .filter((heading): heading is typeof heading & { kind: RichReadingSection["kind"] } =>
      heading.kind !== null,
    );

  return headings.map((heading, index) => ({
    body: body
      .slice(heading.end, headings[index + 1]?.index ?? body.length)
      .trim(),
    kind: heading.kind,
  }));
}

function parseBilingualReadingPassage(body: string): ReadingExamBlock | null {
  const paragraphHeadings = [...body.matchAll(/^###\s+(?:Paragraph\s+\d+|内容)\s*$/gim)];
  const chunks = paragraphHeadings.length > 0
    ? paragraphHeadings.map((heading, index) => {
        const start = (heading.index ?? 0) + heading[0].length;
        const end = paragraphHeadings[index + 1]?.index ?? body.length;
        return body.slice(start, end).trim();
      })
    : [body.trim()];
  const pairs = chunks.flatMap((chunk, index) => {
    const originalMarker = /\*\*原文\*\*/i.exec(chunk);
    const translationMarker = /\*\*翻译[：:]?\*\*/i.exec(chunk);
    if (!originalMarker || !translationMarker || translationMarker.index <= originalMarker.index) {
      return [];
    }
    let english = chunk
      .slice(originalMarker.index + originalMarker[0].length, translationMarker.index)
      .trim();
    let translation = chunk
      .slice(translationMarker.index + translationMarker[0].length)
      .trim();

    // Legacy persisted notes placed the Chinese paragraph before the trailing
    // **翻译** marker. Recover that already-saved shape without touching disk.
    if (english && !translation) {
      const legacyPair = createParagraphsFromText(`legacy-reading-${index}`, english)[0];
      if (
        legacyPair &&
        legacyPair.translation !== READING_TRANSLATION_PLACEHOLDER
      ) {
        english = legacyPair.english;
        translation = legacyPair.translation;
      }
    }
    if (!english || !translation) return [];
    return [{ english, number: index + 1, translation }];
  });

  if (pairs.length === 0) return null;

  return {
    english: pairs
      .map((pair) => `#### Paragraph ${pair.number}\n\n${pair.english}`)
      .join("\n\n"),
    kind: "passage",
    translation: pairs
      .map((pair) => `#### 第 ${pair.number} 段\n\n${pair.translation}`)
      .join("\n\n"),
  };
}

/**
 * Study notes often arrive as a rich Markdown handout rather than the compact
 * `### 篇章 / ### 题目` interchange format. Preserve its reading order and
 * merge the repeated 原文/翻译 copies into one bilingual passage.
 */
function parseRichReadingComprehension(body: string): ReadingExamBlock[] | null {
  const sections = splitRichReadingSections(body);
  if (sections.length === 0) return null;

  const translated = sections.find((section) => section.kind === "translation");
  const original = sections.find((section) => section.kind === "original");
  const passage = translated ? parseBilingualReadingPassage(translated.body) : null;
  const blocks: ReadingExamBlock[] = [];

  if (passage) {
    blocks.push(passage);
  } else if (original?.body) {
    blocks.push({ english: original.body, kind: "passage" });
  }

  const questions = sections.find((section) => section.kind === "questions");
  if (questions?.body) blocks.push({ english: questions.body, kind: "questions" });

  const analysis = sections.find((section) => section.kind === "analysis");
  if (analysis?.body) blocks.push({ english: analysis.body, kind: "answers" });

  for (const section of sections) {
    if (section.kind !== "structure" || !section.body) continue;
    blocks.push({ english: section.body, kind: "other" });
  }

  return blocks.length > 0 ? blocks : null;
}

/**
 * Parse markdown that uses `## 题型: …` markers into exam sections.
 * Returns null when no valid exam markers are present.
 */
export function parseReadingExamMarkdown(markdown: string): ReadingExamSection[] | null {
  const body = normalizeLegacyExamHeading(stripMarkdownFrontmatter(markdown)).trim();
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
    const readingStudyBlocks = type === "reading"
      ? parseReadingStudyTemplate(sectionBody)?.blocks
      : undefined;
    const blocks =
      type === "reading"
        ? (
          parseDetailedReadingHandout(sectionBody) ??
          readingStudyBlocks ??
          parseRichReadingComprehension(sectionBody) ??
          parseInnerBlocks(sectionBody)
        )
        : type === "writing_a" || type === "writing_b"
          ? parseCompositionBlocks(sectionBody)
          : parseInnerBlocks(sectionBody);
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
  const importedAt = new Date().toISOString();
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
    importedAt,
    kicker: options.fileName,
    originalFileName: options.fileName,
    paragraphs,
    progress: 0,
    title: titleBase || firstLabel || "Exam reading",
  };
}

export const READING_EXAM_TYPE_LABELS: Record<ReadingExamType, string> = {
  reading: "阅读理解",
  new_order: "新题型-排序",
  new_seven_five: "新题型-七选五",
  translation: "翻译",
  writing_a: "写作-应用文",
  writing_b: "写作-大作文",
};

const BLOCK_HEADING_LABELS: Record<ReadingExamBlockKind, string> = {
  directions: "Directions",
  overview: "一分钟读懂全文",
  passage: "篇章",
  logic_map: "全文逻辑地图",
  sentences: "长难句精讲",
  vocabulary: "关键词与表达",
  options: "选项",
  questions: "题目",
  synonyms: "文章中的「同义替换」",
  pitfalls: "容易误解的地方",
  retelling: "用大白话重新讲一遍文章",
  takeaways: "读完这篇文章真正需要记住什么",
  summary: "最终压缩",
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

function isReadingStudySection(section: ReadingExamSection) {
  return section.blocks.length === READING_STUDY_TEMPLATE.length &&
    READING_STUDY_TEMPLATE.every(
      (template, index) => section.blocks[index]?.kind === template.kind,
    );
}

function serializeReadingStudySection(section: ReadingExamSection) {
  const header = `## 题型: ${READING_EXAM_TYPE_LABELS[section.type] ?? section.label}`;
  const body = READING_STUDY_TEMPLATE.map((template, index) => {
    const block = section.blocks[index]!;
    const content = block.translation
      ? `${block.english}\n\n${block.translation}`
      : block.english;
    return `## ${template.number}. ${template.titles[0]}\n\n${content}`;
  }).join("\n\n");

  return `${header}\n\n${body}`;
}

/** Serialize exam sections back to marker markdown for vault persistence. */
export function serializeReadingExamSections(sections: ReadingExamSection[]) {
  return sections
    .map((section) => {
      if (isReadingStudySection(section)) {
        return serializeReadingStudySection(section);
      }
      const header = `## 题型: ${READING_EXAM_TYPE_LABELS[section.type] ?? section.label}`;
      const body = section.blocks
        .map((block) => {
          const title = block.title ?? BLOCK_HEADING_LABELS[block.kind] ?? "内容";
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
