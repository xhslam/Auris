"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpenText,
  CaretDown,
  CaretRight,
  Crosshair,
  Leaf,
  Lightbulb,
  Scales,
  Star,
  type Icon,
} from "@phosphor-icons/react";
import { PersonalVocabMarkdown } from "@/components/workspace/personal-vocab-markdown";
import {
  PERSONAL_VOCAB_SECTION_CONTRACTS,
  selectPersonalVocabMarkdownGroups,
  type PersonalVocabMarkdownGroup,
} from "@/features/dictionary/personal-vocab/personal-vocab-markdown";
import type { WordCardEntry } from "@/features/dictionary/word-card-entry";

type SegmentedWordSectionKey =
  | "context"
  | "etymology"
  | "usage"
  | "deep"
  | "epiphany";

type SegmentedWordSection = {
  emptyCopy: string;
  icon: Icon;
  key: SegmentedWordSectionKey;
  groups: PersonalVocabMarkdownGroup[];
  label: string;
  preview?: string;
  title: string;
};

type SegmentedWordCardProps = {
  closeIcon: ReactNode;
  contextText?: string;
  emptyHint?: string;
  entry: WordCardEntry | null;
  error: string | null;
  isLoading: boolean;
  isSaved: boolean;
  onClose: () => void;
  onSaveToggle: () => void;
  onSpeak: () => void;
  saveIcon: ReactNode;
  speakIcon: ReactNode;
  term: string;
  toast?: string | null;
};

const SECTION_ORDER: Array<{
  emptyCopy: string;
  icon: Icon;
  key: SegmentedWordSectionKey;
  label: string;
  personalKey?: keyof typeof PERSONAL_VOCAB_SECTION_CONTRACTS;
  title: string;
}> = [
  {
    emptyCopy: "这个词还没有当前语境解析。",
    icon: Crosshair,
    key: "context",
    label: "当前语境",
    title: "当前语境",
  },
  {
    emptyCopy: "这个词还没有词源或构词内容。",
    icon: Leaf,
    key: "etymology",
    label: "词源构词",
    personalKey: "etymology",
    title: "词源构词",
  },
  {
    emptyCopy: "这个词还没有用法边界内容。",
    icon: Scales,
    key: "usage",
    label: "用法边界",
    personalKey: "usage",
    title: "用法边界",
  },
  {
    emptyCopy: "这个词还没有深层解释内容。",
    icon: Lightbulb,
    key: "deep",
    label: "深层解释",
    personalKey: "deep",
    title: "深层解释",
  },
  {
    emptyCopy: "这个词还没有一语道破内容。",
    icon: Star,
    key: "epiphany",
    label: "一语道破",
    personalKey: "epiphany",
    title: "一语道破",
  },
];

function getUsageFallbackLines(entry: WordCardEntry | null) {
  if (!entry) {
    return [];
  }

  const definitionLine = entry.definition
    ? [
        `${entry.partOfSpeech ? `${entry.partOfSpeech}: ` : ""}${entry.definition}`,
      ]
    : [];
  const relatedLine =
    entry.relatedWords.length > 0
      ? [`相关词: ${entry.relatedWords.join(", ")}`]
      : [];
  const examples = entry.examples.map((example) => `例句: ${example}`);

  return [...definitionLine, ...relatedLine, ...examples];
}

function countGroupLines(groups: readonly PersonalVocabMarkdownGroup[]) {
  return groups.reduce((count, group) => count + group.lines.length, 0);
}

function readContextField(
  groups: readonly PersonalVocabMarkdownGroup[],
  field: "折叠摘要" | "展开解析",
) {
  const pattern = new RegExp(
    `^\\s*(?:\\*\\*)?${field}(?:\\*\\*)?\\s*[：:]\\s*(.+)$`,
  );

  for (const line of groups.flatMap((group) => group.lines)) {
    const match = pattern.exec(line);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function buildSections(entry: WordCardEntry | null): SegmentedWordSection[] {
  return SECTION_ORDER.map((section) => {
    if (section.key === "context") {
      const savedGroups = selectPersonalVocabMarkdownGroups(
        entry?.sections ?? [],
        "context",
      );
      const summary = readContextField(savedGroups, "折叠摘要");
      const detail = readContextField(savedGroups, "展开解析");

      return {
        ...section,
        groups: detail
          ? [{ id: "context-detail", lines: [detail] }]
          : savedGroups,
        preview: summary || undefined,
      };
    }

    const groups = entry && section.personalKey
      ? selectPersonalVocabMarkdownGroups(entry.sections, section.personalKey)
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

function isSectionEmpty(section: SegmentedWordSection) {
  return countGroupLines(section.groups) === 0;
}

function stripMarkdownPreview(value: string) {
  return value
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSectionPreview(section: SegmentedWordSection) {
  if (section.preview) {
    return stripMarkdownPreview(section.preview);
  }

  const firstLine = section.groups[0]?.lines[0];
  if (!firstLine) {
    return section.emptyCopy;
  }

  const preview = stripMarkdownPreview(firstLine);
  return section.key === "context"
    ? preview
    : preview.replace(/^[^:：]{1,14}[:：]\s*/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedContext({ context, word }: { context: string; word: string }) {
  const lookup = word.trim();
  if (!lookup) {
    return context;
  }

  const parts = context.split(new RegExp(`(${escapeRegExp(lookup)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === lookup.toLowerCase() ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    ),
  );
}

export function SegmentedWordCard({
  closeIcon,
  contextText,
  emptyHint = "收录后这里会显示分区词条内容。",
  entry,
  error,
  isLoading,
  isSaved,
  onClose,
  onSaveToggle,
  onSpeak,
  saveIcon,
  speakIcon,
  term,
  toast,
}: SegmentedWordCardProps) {
  const [activeSectionKey, setActiveSectionKey] =
    useState<SegmentedWordSectionKey | null>("context");
  const sections = useMemo(() => buildSections(entry), [entry]);
  const resolvedContextText = contextText?.trim() ?? "";
  const displayWord = entry?.word ?? term;

  useEffect(() => {
    setActiveSectionKey("context");
  }, [term, contextText]);

  return (
    <>
      <div className="word-segmented-card__head" data-word-card-drag-handle="">
        <div className="word-segmented-card__title">
          <div className="word-segmented-card__title-line">
            <h2>{displayWord}</h2>
            {entry?.phonetic ? (
              <span className="word-segmented-card__phonetic">{entry.phonetic}</span>
            ) : null}
          </div>
          {entry ? (
            <p className="word-segmented-card__summary">
              {entry.partOfSpeech ? <em>{entry.partOfSpeech}</em> : null}
              {entry.definition}
            </p>
          ) : (
            <p className="word-segmented-card__summary word-segmented-card__summary--empty">
              {isLoading
                ? "正在查询个人词库…"
                : `${error ?? "资料库里没有这个词。"} 点书签可加入待整理。`}
            </p>
          )}
        </div>

        <div className="word-segmented-card__tools" data-word-card-no-drag="">
          <button
            aria-label={isSaved ? "取消收藏" : entry ? "收藏到生词本" : "加入待整理"}
            className="word-segmented-card__tool"
            data-on={isSaved ? "true" : "false"}
            onClick={onSaveToggle}
            type="button"
          >
            {saveIcon}
          </button>
          <button
            aria-label="发音"
            className="word-segmented-card__tool"
            onClick={onSpeak}
            type="button"
          >
            {speakIcon}
          </button>
          <button
            aria-label="关闭"
            className="word-segmented-card__tool"
            onClick={onClose}
            type="button"
          >
            {closeIcon}
          </button>
        </div>
      </div>

      <div className="word-segmented-card__body">
        {isLoading ? (
          <p className="word-segmented-card__hint">正在读取 05-word 词条解析。</p>
        ) : (
          <>
            <section
              aria-label="在这句话里"
              className="word-segmented-card__context-hero"
            >
              <div className="word-segmented-card__context-label">
                <BookOpenText aria-hidden="true" size={18} weight="regular" />
                <strong>在这句话里</strong>
              </div>
              <p>
                {resolvedContextText ? (
                  <HighlightedContext context={resolvedContextText} word={displayWord} />
                ) : (
                  "当前没有句子上下文。"
                )}
              </p>
            </section>

            <div
              aria-label={`${displayWord} 单词卡分区`}
              className="word-segmented-card__accordion"
            >
              {sections.map((section) => {
                const isActive = activeSectionKey === section.key;
                const SectionIcon = section.icon;
                const panelId = `word-section-${section.key}`;

                return (
                  <div
                    className="word-segmented-card__accordion-item"
                    data-active={isActive ? "true" : "false"}
                    data-empty={isSectionEmpty(section) ? "true" : "false"}
                    key={section.key}
                  >
                    <button
                      aria-controls={panelId}
                      aria-expanded={isActive}
                      aria-label={section.label}
                      className="word-segmented-card__accordion-trigger"
                      onClick={() => setActiveSectionKey(section.key)}
                      type="button"
                    >
                      <SectionIcon
                        aria-hidden="true"
                        className="word-segmented-card__section-icon"
                        size={22}
                        weight="regular"
                      />
                      <span className="word-segmented-card__accordion-label">
                        {section.label}
                      </span>
                      {isActive ? (
                        <span className="word-segmented-card__accordion-state">展开</span>
                      ) : (
                        <span className="word-segmented-card__accordion-preview">
                          {getSectionPreview(section)}
                        </span>
                      )}
                      {isActive ? (
                        <CaretDown aria-hidden="true" size={17} weight="bold" />
                      ) : (
                        <CaretRight aria-hidden="true" size={17} weight="bold" />
                      )}
                    </button>

                    {isActive ? (
                      <section
                        aria-label={section.title}
                        className="word-segmented-card__accordion-panel"
                        id={panelId}
                      >
                        {isSectionEmpty(section) ? (
                          <p className="word-segmented-card__empty-copy">
                            {section.emptyCopy}
                          </p>
                        ) : (
                          <PersonalVocabMarkdown groups={section.groups} />
                        )}
                      </section>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!isLoading && !entry ? (
          <p className="word-segmented-card__hint">{emptyHint}</p>
        ) : null}
      </div>

      {!isLoading && entry ? (
        <footer className="word-segmented-card__source">
          <BookOpenText aria-hidden="true" size={15} weight="regular" />
          <span>来源 · 个人词库</span>
        </footer>
      ) : null}

      {toast ? <p className="word-segmented-card__toast">{toast}</p> : null}
    </>
  );
}
