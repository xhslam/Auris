"use client";

import { useCallback, useMemo } from "react";
import { NotesSearchPanel } from "@/components/notes-v2/notes-search-panel";
import { NotesTagFilter } from "@/components/notes-v2/notes-tag-filter";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import {
  collectDocumentTags,
  parseSearchQuery,
} from "@/features/notes/documents/document-search";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesLibraryNavigatorPanelProps = {
  documents: NoteDocument[];
  onClose?: () => void;
  onOpenPath: (path: string) => void;
  onSearchQueryChange?: (value: string) => void;
  recentDocuments: NoteDocument[];
  searchQuery: string;
  searchResults: NoteDocument[];
};

function getDocumentTitle(document: NoteDocument) {
  return document.parsed.title ?? document.fileName;
}

function buildQueryFromParts(tagFilters: string[], textTerms: string[]) {
  return [...tagFilters.map((tag) => `#${tag}`), ...textTerms].join(" ");
}

export function NotesLibraryNavigatorPanel({
  documents,
  onClose,
  onOpenPath,
  onSearchQueryChange,
  recentDocuments,
  searchQuery,
  searchResults,
}: NotesLibraryNavigatorPanelProps) {
  const tags = useMemo(() => collectDocumentTags(documents), [documents]);
  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  const handleOpenPath = useCallback(
    (path: string) => {
      onOpenPath(path);
      onClose?.();
    },
    [onClose, onOpenPath],
  );

  const handleToggleTag = useCallback(
    (tag: string) => {
      const normalized = tag.toLowerCase();
      const isActive = parsedQuery.tagFilters.includes(normalized);
      const nextTagFilters = isActive
        ? parsedQuery.tagFilters.filter((filter) => filter !== normalized)
        : [...parsedQuery.tagFilters, normalized];

      onSearchQueryChange?.(
        buildQueryFromParts(nextTagFilters, parsedQuery.textTerms),
      );
    },
    [onSearchQueryChange, parsedQuery],
  );

  const handleClearTags = useCallback(() => {
    onSearchQueryChange?.(buildQueryFromParts([], parsedQuery.textTerms));
  }, [onSearchQueryChange, parsedQuery.textTerms]);

  return (
    <div className="notes-v2__library-navigator">
      <NotesSearchPanel
        onOpenPath={handleOpenPath}
        onQueryChange={(value) => onSearchQueryChange?.(value)}
        query={searchQuery}
        results={searchResults}
      />
      <NotesTagFilter
        activeTags={parsedQuery.tagFilters}
        onClear={handleClearTags}
        onToggleTag={handleToggleTag}
        tags={tags}
      />
      <section className="notes-v2__recent-section">
        <div className="notes-v2__section-heading">
          <h3>{NOTES_UI_COPY.leftPane.files.recent}</h3>
          <span>{recentDocuments.length}</span>
        </div>
        {recentDocuments.length > 0 ? (
          <ul className="notes-v2__panel-list">
            {recentDocuments.map((document) => (
              <li key={document.path}>
                <button
                  aria-label={`Open recent note ${getDocumentTitle(document)}`}
                  onClick={() => handleOpenPath(document.path)}
                  type="button"
                >
                  <strong>{getDocumentTitle(document)}</strong>
                  <span>{document.path}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notes-v2__empty-copy">
            {NOTES_UI_COPY.leftPane.files.emptyRecent}
          </p>
        )}
      </section>
    </div>
  );
}
