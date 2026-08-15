"use client";

import { useState, type ReactNode } from "react";
import type {
  ReadingExamBlock,
  ReadingExamSection,
  ReadingExamType,
} from "@/features/reading/reading-fixtures";
import { READING_EXAM_TYPE_LABELS } from "@/features/reading/reading-exam-parse";
import {
  parseExamMarkdown,
  type ExamMdBlock,
  type ExamMdInline,
} from "@/features/reading/reading-exam-markdown";
import {
  cleanDisplayToken,
  tokenizeParagraph,
} from "@/features/reading/reading-text";

type ReadingExamViewProps = {
  onLookupWord: (
    event: React.MouseEvent<HTMLElement>,
    paragraphId: string,
    term: string,
  ) => void;
  sections: ReadingExamSection[];
  showTranslation: boolean;
  wordActiveKey: string | null;
};

const BLOCK_TITLES: Record<string, string> = {
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
  underlined: "划线 / 译文",
  answers: "参考答案",
  letter: "来信",
  chart: "图表说明",
  prompt: "要求",
  model: "范文",
  other: "内容",
};

const STUDY_BLOCK_NUMBERS: Partial<Record<ReadingExamBlock["kind"], number>> = {
  overview: 0,
  passage: 1,
  logic_map: 2,
  sentences: 3,
  vocabulary: 4,
  questions: 5,
  synonyms: 6,
  pitfalls: 7,
  retelling: 8,
  takeaways: 9,
  summary: 10,
};

const SENTENCE_DETAIL_TITLES = [
  "句子结构",
  "语法现象",
  "常见用法",
  "词汇与表达",
  "综合点评",
] as const;

const SENTENCE_SECTION_TITLES = [
  "英文",
  "中文",
  ...SENTENCE_DETAIL_TITLES,
] as const;

type SentenceStudyEntry = {
  details: Array<{ body: string; title: string }>;
  label: string;
  lead: string;
};

function parseSentenceStudyEntries(markdown: string): SentenceStudyEntry[] {
  const sentenceHeadings = [...markdown.matchAll(
    /^###\s+((?:Sentence\s*\d+|\u7b2c?\s*\d+\s*\u53e5|\u53e5\u5b50\s*\d+|Paragraph\s+\d+\s*[（(]P\d+-\d+[）)]).*?)\s*$/gim,
  )];

  return sentenceHeadings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = sentenceHeadings[index + 1]?.index ?? markdown.length;
    const content = markdown.slice(start, end).trim();
    const detailHeadings = [...content.matchAll(
      /^(?:#{3,6}\s+(\u53e5\u5b50\u7ed3\u6784|\u8bed\u6cd5\u73b0\u8c61|\u5e38\u89c1\u7528\u6cd5|\u8bcd\u6c47\u4e0e\u8868\u8fbe|\u7efc\u5408\u70b9\u8bc4)|\*\*(\u53e5\u5b50\u7ed3\u6784|\u8bed\u6cd5\u73b0\u8c61|\u5e38\u89c1\u7528\u6cd5|\u8bcd\u6c47\u4e0e\u8868\u8fbe|\u7efc\u5408\u70b9\u8bc4)[：:]?\*\*)\s*$/gm,
    )];
    const leadEnd = detailHeadings[0]?.index ?? content.length;
    const details = detailHeadings.map((detail, detailIndex) => {
      const detailStart = (detail.index ?? 0) + detail[0].length;
      const detailEnd = detailHeadings[detailIndex + 1]?.index ?? content.length;
      return {
        body: content.slice(detailStart, detailEnd).trim(),
        title: detail[1] ?? detail[2] ?? SENTENCE_DETAIL_TITLES[detailIndex] ?? "讲解",
      };
    });

    return {
      details,
      label: heading[1]?.trim() || `Sentence ${index + 1}`,
      lead: content.slice(0, leadEnd).trim(),
    };
  }).filter((entry) => entry.lead || entry.details.length > 0);
}

function normalizeSentenceLead(markdown: string) {
  const labeled = markdown.match(
    /^\*\*英文[：:]?\*\*\s*\n([\s\S]*?)^\*\*中文[：:]?\*\*\s*\n([\s\S]*)$/m,
  );
  if (labeled) {
    return `${labeled[1]?.trim() ?? ""}\n\n${labeled[2]?.trim() ?? ""}`.trim();
  }
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 2 && !lines.some((line) => /^[-*+]\s|^\d+[.)]\s/.test(line))) {
    return lines.join("\n\n");
  }
  return markdown;
}

function hasSentenceStudyMarkup(markdown: string) {
  return (
    /^\*\*英文[：:]?\*\*\s*$/m.test(markdown) &&
    /^\*\*中文[：:]?\*\*\s*$/m.test(markdown) &&
    /^\*\*(?:句子结构|语法现象|常见用法|词汇与表达|综合点评)[：:]?\*\*\s*$/m.test(markdown)
  );
}

function extractSentenceStudySections(markdown: string) {
  const markerPattern = /^\*\*(英文|中文|句子结构|语法现象|常见用法|词汇与表达|综合点评)[：:]?\*\*\s*$/gm;
  const markers = [...markdown.matchAll(markerPattern)];
  const sections = new Map<string, string>();

  markers.forEach((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? markdown.length;
    const body = markdown
      .slice(start, end)
      .replace(/\n\s*---\s*$/g, "")
      .trim();
    if (marker[1] && body) sections.set(marker[1], body);
  });

  return sections;
}

function hasPersistedSentenceStudy(block: ReadingExamBlock) {
  const combined = [block.english, block.translation].filter(Boolean).join("\n\n");
  const sections = extractSentenceStudySections(combined);
  const hasDetails = SENTENCE_DETAIL_TITLES.some((title) => sections.has(title));
  return sections.has("英文") && sections.has("中文") && hasDetails;
}

function createPersistedSentenceMarkdown(block: ReadingExamBlock, sentenceIndex: number) {
  const combined = [block.english, block.translation].filter(Boolean).join("\n\n");
  const sections = extractSentenceStudySections(combined);
  if (!hasPersistedSentenceStudy(block)) return null;

  const body = SENTENCE_SECTION_TITLES.flatMap((title) => {
    const content = sections.get(title);
    return content ? [`**${title}**`, content] : [];
  }).join("\n\n");

  return `### Sentence ${sentenceIndex + 1}\n\n${body}`;
}

function isReadingStudyGuide(section: ReadingExamSection) {
  return section.type === "reading" && section.blocks.some(
    (block) =>
      block.kind === "overview" ||
      hasSentenceStudyMarkup(block.english) ||
      hasPersistedSentenceStudy(block),
  );
}

const EXAM_PRESENTATIONS: Record<
  ReadingExamType,
  { eyebrow: string; hint: string; layout: string }
> = {
  cloze: {
    eyebrow: "Context · Choice · Coherence",
    hint: "先通读篇章，再在语境中逐一落词。",
    layout: "cloze-sheet",
  },
  reading: {
    eyebrow: "Passage · Evidence · Questions",
    hint: "正文保持连续阅读，题目作为独立答题区。",
    layout: "passage-questions",
  },
  new_order: {
    eyebrow: "Sequence · Logic · Structure",
    hint: "先锁定答题链，再排列下方段落卡片。",
    layout: "sequence-board",
  },
  new_seven_five: {
    eyebrow: "Gaps · Options · Cohesion",
    hint: "篇章与候选句分区陈列，方便来回比对。",
    layout: "gap-matcher",
  },
  translation: {
    eyebrow: "Source · Underline · Translation",
    hint: "原文提供语境，划线句进入专属翻译工作区。",
    layout: "translation-desk",
  },
  writing_a: {
    eyebrow: "Read · Notice · Reuse",
    hint: "按段精读英文、译文与可复用表达。",
    layout: "composition-handout",
  },
  writing_b: {
    eyebrow: "Read · Notice · Reuse",
    hint: "按段精读英文、译文与可复用表达。",
    layout: "composition-handout",
  },
};

function renderWordTokens(
  text: string,
  paragraphId: string,
  keyPrefix: string,
  wordActiveKey: string | null,
  onLookupWord: ReadingExamViewProps["onLookupWord"],
): ReactNode[] {
  return tokenizeParagraph(text).map((token, index) => {
    const cleaned = cleanDisplayToken(token);
    if (!cleaned) {
      return <span key={`${keyPrefix}-${index}`}>{token}</span>;
    }

    const lookup = cleaned.toLowerCase();
    return (
      <span
        className="reading-minimal-word"
        data-active={wordActiveKey === lookup ? "true" : "false"}
        key={`${keyPrefix}-${index}`}
        onContextMenu={(event) => onLookupWord(event, paragraphId, cleaned)}
      >
        {token}
      </span>
    );
  });
}

function renderInlineNodes(
  nodes: ExamMdInline[],
  paragraphId: string,
  keyPrefix: string,
  wordActiveKey: string | null,
  onLookupWord: ReadingExamViewProps["onLookupWord"],
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    if (node.type === "blank") {
      return (
        <span className="reading-exam__blank" key={key}>
          {node.number}
        </span>
      );
    }

    if (node.type === "code") {
      return (
        <code className="reading-exam__code" key={key}>
          {node.value}
        </code>
      );
    }

    if (node.type === "strong") {
      return (
        <strong key={key}>
          {renderInlineNodes(
            node.children,
            paragraphId,
            key,
            wordActiveKey,
            onLookupWord,
          )}
        </strong>
      );
    }

    if (node.type === "em") {
      return (
        <em key={key}>
          {renderInlineNodes(
            node.children,
            paragraphId,
            key,
            wordActiveKey,
            onLookupWord,
          )}
        </em>
      );
    }

    return (
      <span key={key}>
        {renderWordTokens(node.value, paragraphId, key, wordActiveKey, onLookupWord)}
      </span>
    );
  });
}

function renderMdBlocks(
  blocks: ExamMdBlock[],
  paragraphId: string,
  wordActiveKey: string | null,
  onLookupWord: ReadingExamViewProps["onLookupWord"],
): ReactNode {
  return blocks.map((block, index) => {
    const key = `${paragraphId}-md-${index}`;

    if (block.type === "hr") {
      return <hr className="reading-exam__hr" key={key} />;
    }

    if (block.type === "heading") {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag className="reading-exam__heading" key={key}>
          {renderInlineNodes(
            block.children,
            paragraphId,
            key,
            wordActiveKey,
            onLookupWord,
          )}
        </Tag>
      );
    }

    if (block.type === "blockquote") {
      return (
        <blockquote className="reading-exam__quote" key={key}>
          {renderInlineNodes(
            block.children,
            paragraphId,
            key,
            wordActiveKey,
            onLookupWord,
          )}
        </blockquote>
      );
    }

    if (block.type === "codeblock") {
      return (
        <pre className="reading-exam__codeblock" key={key}>
          <code>{block.value}</code>
        </pre>
      );
    }

    if (block.type === "ul") {
      return (
        <ul className="reading-exam__list" key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-li-${itemIndex}`}>
              {renderInlineNodes(
                item,
                paragraphId,
                `${key}-li-${itemIndex}`,
                wordActiveKey,
                onLookupWord,
              )}
            </li>
          ))}
        </ul>
      );
    }

    if (block.type === "ol") {
      return (
        <ol className="reading-exam__list reading-exam__list--ordered" key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-li-${itemIndex}`}>
              {renderInlineNodes(
                item,
                paragraphId,
                `${key}-li-${itemIndex}`,
                wordActiveKey,
                onLookupWord,
              )}
            </li>
          ))}
        </ol>
      );
    }

    if (block.type === "table") {
      return (
        <div className="reading-exam__table-wrap" key={key}>
          <table className="reading-exam__table">
            {block.header ? (
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={`${key}-th-${cellIndex}`}>
                      {renderInlineNodes(
                        cell,
                        paragraphId,
                        `${key}-th-${cellIndex}`,
                        wordActiveKey,
                        onLookupWord,
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-td-${rowIndex}-${cellIndex}`}>
                      {renderInlineNodes(
                        cell,
                        paragraphId,
                        `${key}-td-${rowIndex}-${cellIndex}`,
                        wordActiveKey,
                        onLookupWord,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <p className="reading-exam__paragraph" key={key}>
        {renderInlineNodes(
          block.children,
          paragraphId,
          key,
          wordActiveKey,
          onLookupWord,
        )}
      </p>
    );
  });
}

function SentenceStudyView({
  entries,
  onLookupWord,
  paragraphId,
  wordActiveKey,
}: {
  entries: SentenceStudyEntry[];
  onLookupWord: ReadingExamViewProps["onLookupWord"];
  paragraphId: string;
  wordActiveKey: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const toggleEntry = (entryIndex: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entryIndex)) next.delete(entryIndex);
      else next.add(entryIndex);
      return next;
    });
  };

  return (
    <div className="reading-sentence-study">
      {entries.map((entry, entryIndex) => {
        const isExpanded = expanded.has(entryIndex);
        const detailId = `${paragraphId}-sentence-${entryIndex}-details`;
        return (
          <article
            className="reading-sentence-study__item"
            data-expanded={isExpanded ? "true" : "false"}
            key={`${entry.label}-${entryIndex}`}
          >
            <button
              aria-controls={detailId}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "收起" : "展开"}${entry.label}讲解`}
              className="reading-sentence-study__toggle"
              disabled={entry.details.length === 0}
              onClick={() => toggleEntry(entryIndex)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <g className="reading-sentence-study__toggle-sun">
                  <circle cx="8" cy="8" r="2.35" />
                  <path d="M8 1.75v1.3M8 12.95v1.3M1.75 8h1.3M12.95 8h1.3M3.58 3.58l.92.92M11.5 11.5l.92.92M12.42 3.58l-.92.92M4.5 11.5l-.92.92" />
                </g>
                <path
                  className="reading-sentence-study__toggle-moon"
                  d="M11.85 10.75A5 5 0 0 1 5.25 4.15a5 5 0 1 0 6.6 6.6Z"
                />
              </svg>
            </button>
            <div className="reading-sentence-study__content">
              <p className="reading-sentence-study__label">{entry.label}</p>
              <div className="reading-sentence-study__lead">
                {renderMdBlocks(
                  parseExamMarkdown(normalizeSentenceLead(entry.lead)),
                  `${paragraphId}-sentence-${entryIndex}`,
                  wordActiveKey,
                  onLookupWord,
                )}
              </div>
              {entry.details.length > 0 ? (
                <div
                  className="reading-sentence-study__details"
                  hidden={!isExpanded}
                  id={detailId}
                >
                  {entry.details.map((detail, detailIndex) => (
                    <section
                      className="reading-sentence-study__detail"
                      key={`${detail.title}-${detailIndex}`}
                    >
                      <h4>{detail.title}</h4>
                      <div>
                        {renderMdBlocks(
                          parseExamMarkdown(detail.body),
                          `${paragraphId}-sentence-${entryIndex}-detail-${detailIndex}`,
                          wordActiveKey,
                          onLookupWord,
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ExamBlockView({
  block,
  blockIndex,
  isStudyGuide,
  sentenceIndex,
  onLookupWord,
  paragraphId,
  showTranslation,
  wordActiveKey,
}: {
  block: ReadingExamBlock;
  blockIndex: number;
  isStudyGuide: boolean;
  sentenceIndex: number;
  onLookupWord: ReadingExamViewProps["onLookupWord"];
  paragraphId: string;
  showTranslation: boolean;
  wordActiveKey: string | null;
}) {
  const title = block.title ?? (isStudyGuide && block.kind === "passage"
    ? "逐句翻译和讲解"
    : BLOCK_TITLES[block.kind] ?? BLOCK_TITLES.other);
  const displayNumber = STUDY_BLOCK_NUMBERS[block.kind] ?? blockIndex + 1;
  const englishBlocks = parseExamMarkdown(block.english);
  const sentenceEntries = isStudyGuide && block.kind === "passage"
    ? parseSentenceStudyEntries(block.english)
    : [];
  const persistedSentenceMarkdown = createPersistedSentenceMarkdown(block, sentenceIndex);
  const isPersistedSentenceBlock = sentenceEntries.length === 0 &&
    persistedSentenceMarkdown !== null;
  const displayedSentenceEntries = isPersistedSentenceBlock
    ? parseSentenceStudyEntries(persistedSentenceMarkdown)
    : sentenceEntries;

  return (
    <article
      className="reading-exam__block"
      data-block-index={blockIndex + 1}
      data-kind={block.kind}
      data-sentence-study={isPersistedSentenceBlock ? "persisted" : undefined}
    >
      {!isPersistedSentenceBlock ? (
        <header className="reading-exam__block-title">
          <span aria-hidden="true">{String(displayNumber).padStart(2, "0")}</span>
          {title}
        </header>
      ) : null}
      <div className="reading-exam__block-body">
        {displayedSentenceEntries.length > 0 ? (
          <SentenceStudyView
            entries={displayedSentenceEntries}
            onLookupWord={onLookupWord}
            paragraphId={paragraphId}
            wordActiveKey={wordActiveKey}
          />
        ) : (
          renderMdBlocks(englishBlocks, paragraphId, wordActiveKey, onLookupWord)
        )}
      </div>
      {!isPersistedSentenceBlock && showTranslation && block.translation ? (
        <div className="reading-exam__translation">
          {renderMdBlocks(
            parseExamMarkdown(block.translation),
            `${paragraphId}-zh`,
            wordActiveKey,
            onLookupWord,
          )}
        </div>
      ) : null}
    </article>
  );
}

export function ReadingExamView({
  onLookupWord,
  sections,
  showTranslation,
  wordActiveKey,
}: ReadingExamViewProps) {
  return (
    <div className="reading-exam">
      {sections.map((section, sectionIndex) => (
        <section
          className="reading-exam__section"
          data-layout={
            isReadingStudyGuide(section)
              ? "reading-study"
              : EXAM_PRESENTATIONS[section.type].layout
          }
          data-type={section.type}
          key={`${section.type}-${sectionIndex}`}
        >
          <header className="reading-exam__section-header">
            <span className="reading-exam__section-number" aria-hidden="true">
              {String(sectionIndex + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="reading-exam__section-eyebrow">
                {isReadingStudyGuide(section)
                  ? "Postgraduate English I · Close Reading"
                  : EXAM_PRESENTATIONS[section.type].eyebrow}
              </p>
              <h2 className="reading-exam__section-title">
                {isReadingStudyGuide(section)
                  ? "考研英语一｜文章精读"
                  : READING_EXAM_TYPE_LABELS[section.type] ?? section.label}
              </h2>
              <p className="reading-exam__section-hint">
                {isReadingStudyGuide(section)
                  ? "从论点、结构、句法与命题证据四条线读懂一篇文章。"
                  : EXAM_PRESENTATIONS[section.type].hint}
              </p>
            </div>
          </header>
          <div className="reading-exam__section-layout">
            {section.blocks.map((block, blockIndex) => (
              <ExamBlockView
                block={block}
                blockIndex={blockIndex}
                isStudyGuide={isReadingStudyGuide(section)}
                key={`${section.type}-${sectionIndex}-${blockIndex}`}
                onLookupWord={onLookupWord}
                paragraphId={`exam-${sectionIndex}-${blockIndex}`}
                sentenceIndex={section.blocks
                  .slice(0, blockIndex + 1)
                  .filter(hasPersistedSentenceStudy).length - 1}
                showTranslation={showTranslation}
                wordActiveKey={wordActiveKey}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
