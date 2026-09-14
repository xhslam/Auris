"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { parseSearchQuery } from "@/features/notes/documents/document-search";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesSearchPanelProps = {
  onOpenPath: (path: string) => void;
  onQueryChange: (value: string) => void;
  query: string;
  results: NoteDocument[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTerms(text: string, terms: string[]): ReactNode {
  const activeTerms = terms.filter(Boolean);

  if (activeTerms.length === 0) {
    return text;
  }

  const pattern = new RegExp(
    `(${activeTerms.map(escapeRegExp).join("|")})`,
    "gi",
  );
  const termSet = new Set(activeTerms.map((term) => term.toLowerCase()));
  const segments = text.split(pattern);

  return segments.map((segment, index) =>
    segment && termSet.has(segment.toLowerCase()) ? (
      <mark className="notes-v2__search-highlight" key={`${segment}-${index}`}>
        {segment}
      </mark>
    ) : (
      <Fragment key={`${segment}-${index}`}>{segment}</Fragment>
    ),
  );
}

export function NotesSearchPanel({
  onOpenPath,
  onQueryChange,
  query,
  results,
}: NotesSearchPanelProps) {
  const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);

  return (
    <section className="notes-v2__panel">
      <div className="notes-v2__panel-heading">
        <h3>{NOTES_UI_COPY.panels.search.title}</h3>
        <p>{NOTES_UI_COPY.panels.search.description}</p>
      </div>

      <label className="notes-v2__panel-search">
        <span className="sr-only">{NOTES_UI_COPY.panels.search.searchSrOnly}</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={NOTES_UI_COPY.panels.search.searchPlaceholder}
          type="search"
          value={query}
        />
      </label>
      <p className="notes-v2__panel-hint">{NOTES_UI_COPY.panels.search.hint}</p>

      {results.length > 0 ? (
        <ul className="notes-v2__panel-list">
          {results.map((document) => (
            <li key={document.path}>
              <button onClick={() => onOpenPath(document.path)} type="button">
                <strong>
                  {highlightTerms(
                    document.parsed.title ?? document.fileName,
                    parsedQuery.textTerms,
                  )}
                </strong>
                <span>{document.path}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.search.empty}</p>
      )}
    </section>
  );
}
