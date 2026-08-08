"use client";

import { useMemo } from "react";
import {
  renderPersonalVocabMarkdown,
  type PersonalVocabMarkdownGroup,
} from "@/features/dictionary/personal-vocab/personal-vocab-markdown";
import "./personal-vocab-markdown.css";

export type PersonalVocabMarkdownProps = {
  groups: readonly PersonalVocabMarkdownGroup[];
};

export function PersonalVocabMarkdown({ groups }: PersonalVocabMarkdownProps) {
  const renderedGroups = useMemo(
    () => {
      const occurrences = new Map<string, number>();

      return groups.map((group) => {
        const occurrence = occurrences.get(group.id) ?? 0;
        occurrences.set(group.id, occurrence + 1);

        return {
          html: renderPersonalVocabMarkdown(group.lines),
          key: `${group.id}:${occurrence}`,
        };
      });
    },
    [groups],
  );

  return (
    <div className="personal-vocab-markdown">
      {renderedGroups.map((group) => (
        <div
          className="personal-vocab-markdown__group"
          dangerouslySetInnerHTML={{ __html: group.html }}
          key={group.key}
        />
      ))}
    </div>
  );
}
