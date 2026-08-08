"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";

type NotesLearningPanelProps = {
  onInsertSnippet: (snippet: string) => void;
  onQueryChange: (value: string) => void;
  query: string;
  snippets: LearningSnippet[];
};

export function NotesLearningPanel({
  onInsertSnippet,
  onQueryChange,
  query,
  snippets,
}: NotesLearningPanelProps) {
  return (
    <section
      aria-label={NOTES_UI_COPY.panels.learning.title}
      className="notes-v2__panel notes-v2__panel--compact"
    >
      <label className="notes-v2__panel-search">
        <span className="sr-only">
          {NOTES_UI_COPY.panels.learning.searchSrOnly}
        </span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={NOTES_UI_COPY.panels.learning.searchPlaceholder}
          type="search"
          value={query}
        />
      </label>

      {snippets.length > 0 ? (
        <ul className="notes-v2__panel-list">
          {snippets.map((snippet) => (
            <li key={snippet.id}>
              <button onClick={() => onInsertSnippet(snippet.markdown)} type="button">
                <strong>{snippet.label}</strong>
                <span>
                  {snippet.kind === "word"
                    ? NOTES_UI_COPY.panels.learning.wordSnippet
                    : NOTES_UI_COPY.panels.learning.sentenceSnippet}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-v2__empty-copy">
          {NOTES_UI_COPY.panels.learning.empty}
        </p>
      )}
    </section>
  );
}
