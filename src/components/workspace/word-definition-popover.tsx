import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { PersonalVocabMarkdown } from "@/components/workspace/personal-vocab-markdown";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import {
  PERSONAL_VOCAB_SECTION_CONTRACTS,
  selectPersonalVocabContextGroups,
  selectPersonalVocabMarkdownGroups,
  type PersonalVocabMarkdownGroup,
} from "@/features/dictionary/personal-vocab/personal-vocab-markdown";

type WordPopoverSectionKey =
  | "context"
  | "etymology"
  | "usage"
  | "deep"
  | "epiphany";

type WordPopoverSection = {
  emptyCopy: string;
  key: WordPopoverSectionKey;
  groups: PersonalVocabMarkdownGroup[];
  label: string;
  title: string;
};

type WordDefinitionPopoverProps = {
  contextText?: string;
  entry: DictionaryEntry | null;
  error: string | null;
  isLoading: boolean;
  isSaved: boolean;
  onClose?: () => void;
  onSaveWord?: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  position: {
    left: number;
    top: number;
  };
  word: string;
};

const SECTION_ORDER: Array<{
  emptyCopy: string;
  key: WordPopoverSectionKey;
  label: string;
  personalKey?: keyof typeof PERSONAL_VOCAB_SECTION_CONTRACTS;
  title: string;
}> = [
  {
    emptyCopy: "当前没有句子上下文。",
    key: "context",
    label: "当前语境",
    title: "当前语境",
  },
  {
    emptyCopy: "这个词还没有词源或构词内容。",
    key: "etymology",
    label: "词源构词",
    personalKey: "etymology",
    title: "词源构词",
  },
  {
    emptyCopy: "这个词还没有用法边界内容。",
    key: "usage",
    label: "用法边界",
    personalKey: "usage",
    title: "用法边界",
  },
  {
    emptyCopy: "这个词还没有深层解释内容。",
    key: "deep",
    label: "深层解释",
    personalKey: "deep",
    title: "深层解释",
  },
  {
    emptyCopy: "这个词还没有一语道破内容。",
    key: "epiphany",
    label: "一语道破",
    personalKey: "epiphany",
    title: "一语道破",
  },
];

function getDictionaryLabel(sourceLabel?: string | null) {
  if (!sourceLabel) {
    return "离线词典";
  }

  if (sourceLabel.toLowerCase().includes("wordnet")) {
    return "离线词典";
  }

  return sourceLabel;
}

function getLexicalCategoryLabel(category: string) {
  const normalized = category.trim().toLowerCase();

  switch (normalized) {
    case "adjective":
      return "形容词";
    case "adverb":
      return "副词";
    case "noun":
      return "名词";
    case "verb":
      return "动词";
    default:
      return category;
  }
}

function getPrimaryDefinition(entry: DictionaryEntry | null) {
  if (!entry) {
    return "";
  }

  return entry.personal?.definition ?? entry.meanings[0]?.definitions[0] ?? "";
}

function getUsageFallbackLines(entry: DictionaryEntry | null) {
  if (!entry) {
    return [];
  }

  const meaningLines = entry.meanings.flatMap((meaning) =>
    meaning.definitions.map(
      (definition) =>
        `${getLexicalCategoryLabel(meaning.lexicalCategory)}: ${definition}`,
    ),
  );
  const synonymLines =
    entry.synonyms.length > 0 ? [`同义词: ${entry.synonyms.join(", ")}`] : [];

  return [...meaningLines, ...synonymLines];
}

function countGroupLines(groups: readonly PersonalVocabMarkdownGroup[]) {
  return groups.reduce((count, group) => count + group.lines.length, 0);
}

function buildSections(
  entry: DictionaryEntry | null,
  contextText?: string,
): WordPopoverSection[] {
  return SECTION_ORDER.map((section) => {
    if (section.key === "context") {
      return {
        ...section,
        groups: selectPersonalVocabContextGroups(
          entry?.personal?.sections ?? [],
          contextText,
        ),
      };
    }

    const groups = entry?.personal && section.personalKey
      ? selectPersonalVocabMarkdownGroups(entry.personal.sections, section.personalKey)
      : [];
    const fallbackLines = section.key === "usage" && countGroupLines(groups) === 0
      ? getUsageFallbackLines(entry)
      : [];

    return {
      ...section,
      groups: fallbackLines.length > 0
        ? [{ id: "usage-fallback", lines: fallbackLines }]
        : groups,
    };
  });
}

function isSectionEmpty(section: WordPopoverSection) {
  return countGroupLines(section.groups) === 0;
}

function speakWord(word: string) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(word));
}

export function WordDefinitionPopover({
  contextText,
  entry,
  error,
  isLoading,
  isSaved,
  onClose,
  onSaveWord,
  popoverRef,
  position,
  word,
}: WordDefinitionPopoverProps) {
  const [activeSectionKey, setActiveSectionKey] =
    useState<WordPopoverSectionKey | null>(null);
  const style = {
    left: `${position.left}px`,
    top: `${position.top}px`,
  } satisfies CSSProperties;
  const primaryDefinition = getPrimaryDefinition(entry);
  const sections = useMemo(
    () => buildSections(entry, contextText),
    [contextText, entry],
  );
  const activeSection =
    sections.find((section) => section.key === activeSectionKey) ?? null;

  useEffect(() => {
    setActiveSectionKey(null);
  }, [word, contextText]);

  return (
    <div className="definition-popover" ref={popoverRef} style={style}>
      <div className="definition-popover__header">
        <div className="definition-popover__title">
          <p className="definition-popover__source">
            {getDictionaryLabel(entry?.sourceLabel)}
          </p>
          <strong>{entry?.word ?? word}</strong>
          <div className="definition-popover__summary">
            {entry?.pronunciations[0] ? (
              <span>{entry.pronunciations[0]}</span>
            ) : null}
            {primaryDefinition ? <span>{primaryDefinition}</span> : null}
          </div>
        </div>
        <div className="definition-popover__toolbar">
          {entry ? (
            <button
              aria-label={isSaved ? "已加入生词本" : "加入生词本"}
              className="definition-popover__icon-button"
              data-saved={isSaved ? "true" : "false"}
              onClick={onSaveWord}
              title={isSaved ? "已加入生词本" : "加入生词本"}
              type="button"
            >
              书
            </button>
          ) : null}
          <button
            aria-label={`朗读 ${entry?.word ?? word}`}
            className="definition-popover__icon-button"
            onClick={() => speakWord(entry?.word ?? word)}
            title="朗读"
            type="button"
          >
            听
          </button>
          <button
            aria-label="关闭单词卡"
            className="definition-popover__icon-button"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="definition-popover__state">
          <p>正在查询离线词典…</p>
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="definition-popover__state definition-popover__state--error">
          <p>{error}</p>
        </div>
      ) : null}

      {!isLoading && !error && entry ? (
        <div className="definition-popover__content">
          <div className="definition-popover__section-shell">
            <nav
              aria-label={`${entry.word} 单词卡分区`}
              className="definition-popover__section-tabs"
            >
              {sections.map((section) => (
                <button
                  aria-pressed={activeSectionKey === section.key}
                  className="definition-popover__section-tab"
                  data-active={activeSectionKey === section.key ? "true" : "false"}
                  data-empty={isSectionEmpty(section) ? "true" : "false"}
                  key={section.key}
                  onClick={() => setActiveSectionKey(section.key)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <section
              aria-label={activeSection?.title ?? "单词卡内容"}
              className="definition-popover__section-panel"
            >
              {!activeSection ? (
                <div className="definition-popover__blank">
                  <p>选择左侧分区查看内容。</p>
                </div>
              ) : isSectionEmpty(activeSection) ? (
                <div className="definition-popover__blank">
                  <p>{activeSection.emptyCopy}</p>
                </div>
              ) : (
                <div className="definition-popover__section-body">
                  <p className="definition-popover__lexical-category">
                    {activeSection.title}
                  </p>
                  {activeSection.key === "context" ? (
                    <blockquote>{activeSection.groups[0].lines[0]}</blockquote>
                  ) : (
                    <PersonalVocabMarkdown groups={activeSection.groups} />
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
