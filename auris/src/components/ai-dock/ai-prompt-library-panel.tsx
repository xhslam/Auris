"use client";

import type { DesktopAiPromptRecord } from "@/platform/desktop/desktop-bridge";

type AiPromptLibraryPanelProps = {
  isLoading: boolean;
  onCopyPrompt: (record: DesktopAiPromptRecord) => void;
  onExportLibrary: () => void;
  onImportDefaults: () => void;
  onQueryChange: (value: string) => void;
  onToggleFavorite: (record: DesktopAiPromptRecord) => void;
  promptRecords: DesktopAiPromptRecord[];
  query: string;
};

export function AiPromptLibraryPanel({
  isLoading,
  onCopyPrompt,
  onExportLibrary,
  onImportDefaults,
  onQueryChange,
  onToggleFavorite,
  promptRecords,
  query,
}: AiPromptLibraryPanelProps) {
  return (
    <section className="desktop-ai-dock__library-panel">
      <div className="desktop-ai-dock__library-toolbar">
        <label className="desktop-ai-dock__search">
          <span className="desktop-ai-dock__sr-only">Search prompt library</span>
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search prompts"
            type="search"
            value={query}
          />
        </label>
        <div className="desktop-ai-dock__library-actions">
          <button onClick={onImportDefaults} type="button">
            Import Defaults
          </button>
          <button onClick={onExportLibrary} type="button">
            Export JSON
          </button>
        </div>
      </div>

      <div className="desktop-ai-dock__library-scroll">
        {isLoading ? (
          <p className="desktop-ai-dock__status">Loading prompt library…</p>
        ) : null}

        {!isLoading && promptRecords.length === 0 ? (
          <div className="desktop-ai-dock__empty-state">
            <strong>No prompts yet</strong>
            <p>Import the default library or save reusable prompts from your workflow.</p>
          </div>
        ) : null}

        {promptRecords.map((record) => (
          <article className="desktop-ai-dock__library-card" key={record.id}>
            <div className="desktop-ai-dock__library-card-header">
              <div>
                <p className="desktop-ai-dock__eyebrow">{record.category}</p>
                <h3>{record.title}</h3>
              </div>
              <button
                aria-label={
                  record.isFavorite ? "Remove prompt from favorites" : "Add prompt to favorites"
                }
                className="desktop-ai-dock__favorite"
                data-active={record.isFavorite ? "true" : "false"}
                onClick={() => onToggleFavorite(record)}
                type="button"
              >
                {record.isFavorite ? "★" : "☆"}
              </button>
            </div>

            <p className="desktop-ai-dock__library-preview">{record.content}</p>

            <div className="desktop-ai-dock__tag-row">
              {record.tags.map((tag) => (
                <span className="desktop-ai-dock__tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <div className="desktop-ai-dock__library-meta">
              <span>{record.useCount} uses</span>
              <button onClick={() => onCopyPrompt(record)} type="button">
                Copy Prompt
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
