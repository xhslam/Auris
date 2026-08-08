"use client";

import type { ReactNode } from "react";
import type {
  ReadingExamBlock,
  ReadingExamSection,
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
  passage: "篇章",
  options: "选项",
  questions: "题目",
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

function ExamBlockView({
  block,
  onLookupWord,
  paragraphId,
  showTranslation,
  wordActiveKey,
}: {
  block: ReadingExamBlock;
  onLookupWord: ReadingExamViewProps["onLookupWord"];
  paragraphId: string;
  showTranslation: boolean;
  wordActiveKey: string | null;
}) {
  const title = BLOCK_TITLES[block.kind] ?? BLOCK_TITLES.other;
  const englishBlocks = parseExamMarkdown(block.english);

  return (
    <article className="reading-exam__block" data-kind={block.kind}>
      <header className="reading-exam__block-title">{title}</header>
      <div className="reading-exam__block-body">
        {renderMdBlocks(englishBlocks, paragraphId, wordActiveKey, onLookupWord)}
      </div>
      {showTranslation && block.translation ? (
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
          data-type={section.type}
          key={`${section.type}-${sectionIndex}`}
        >
          <h2 className="reading-exam__section-title">
            {READING_EXAM_TYPE_LABELS[section.type] ?? section.label}
          </h2>
          {section.blocks.map((block, blockIndex) => (
            <ExamBlockView
              block={block}
              key={`${section.type}-${sectionIndex}-${blockIndex}`}
              onLookupWord={onLookupWord}
              paragraphId={`exam-${sectionIndex}-${blockIndex}`}
              showTranslation={showTranslation}
              wordActiveKey={wordActiveKey}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
