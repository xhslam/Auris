"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { DocumentTagSummary } from "@/features/notes/documents/document-search";

type NotesTagFilterProps = {
  activeTags: string[];
  onClear: () => void;
  onToggleTag: (tag: string) => void;
  tags: DocumentTagSummary[];
};

export function NotesTagFilter({
  activeTags,
  onClear,
  onToggleTag,
  tags,
}: NotesTagFilterProps) {
  const activeTagSet = new Set(activeTags.map((tag) => tag.toLowerCase()));

  return (
    <section className="notes-v2__panel notes-v2__tag-filter">
      <div className="notes-v2__panel-heading">
        <h3>{NOTES_UI_COPY.panels.tags.title}</h3>
        <p>{NOTES_UI_COPY.panels.tags.description}</p>
      </div>

      {tags.length > 0 ? (
        <>
          <ul className="notes-v2__tag-list">
            {tags.map((entry) => {
              const isActive = activeTagSet.has(entry.tag.toLowerCase());

              return (
                <li key={entry.tag}>
                  <button
                    aria-label={NOTES_UI_COPY.panels.tags.filterLabel(entry.tag)}
                    aria-pressed={isActive}
                    className="notes-v2__tag-chip"
                    data-active={isActive ? "true" : "false"}
                    onClick={() => onToggleTag(entry.tag)}
                    type="button"
                  >
                    <span className="notes-v2__tag-chip-name">#{entry.tag}</span>
                    <span className="notes-v2__tag-chip-count">{entry.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {activeTagSet.size > 0 ? (
            <button
              className="notes-v2__tag-clear"
              onClick={() => onClear()}
              type="button"
            >
              {NOTES_UI_COPY.panels.tags.clear}
            </button>
          ) : null}
        </>
      ) : (
        <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.tags.empty}</p>
      )}
    </section>
  );
}
