"use client";

import type { DesktopAiHistoryRecord } from "@/platform/desktop/desktop-bridge";

type AiChatHistoryPanelProps = {
  historyRecords: DesktopAiHistoryRecord[];
  isLoading: boolean;
  onCaptureConversation: () => void;
  onExportHistory: () => void;
  onQueryChange: (value: string) => void;
  onSelectRecord: (recordId: number) => void;
  onToggleFavorite: (record: DesktopAiHistoryRecord) => void;
  query: string;
  selectedRecordId: number | null;
};

function formatHistoryDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

export function AiChatHistoryPanel({
  historyRecords,
  isLoading,
  onCaptureConversation,
  onExportHistory,
  onQueryChange,
  onSelectRecord,
  onToggleFavorite,
  query,
  selectedRecordId,
}: AiChatHistoryPanelProps) {
  const selectedRecord =
    historyRecords.find((record) => record.id === selectedRecordId) ?? historyRecords[0] ?? null;

  return (
    <section className="desktop-ai-dock__history-panel">
      <div className="desktop-ai-dock__library-toolbar">
        <label className="desktop-ai-dock__search">
          <span className="desktop-ai-dock__sr-only">Search chat history</span>
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search saved chats"
            type="search"
            value={query}
          />
        </label>
        <div className="desktop-ai-dock__library-actions">
          <button onClick={onCaptureConversation} type="button">
            Save current conversation
          </button>
          <button onClick={onExportHistory} type="button">
            Export JSON
          </button>
        </div>
      </div>

      <div className="desktop-ai-dock__history-layout">
        <div className="desktop-ai-dock__history-list">
          {isLoading ? (
            <p className="desktop-ai-dock__status">Loading chat history…</p>
          ) : null}

        {!isLoading && historyRecords.length === 0 ? (
          <div className="desktop-ai-dock__empty-state">
            <strong>No saved chats yet</strong>
            <p>Capture the current provider thread and it will appear here.</p>
          </div>
        ) : null}

        {historyRecords.map((record) => (
          <article
            className="desktop-ai-dock__history-row"
            data-active={selectedRecord?.id === record.id ? "true" : "false"}
            key={record.id}
          >
            <button
              className="desktop-ai-dock__history-row-button"
              onClick={() => onSelectRecord(record.id)}
              type="button"
            >
              <div className="desktop-ai-dock__history-row-copy">
                <strong>{record.title}</strong>
                <span>{formatHistoryDate(record.timestamp)}</span>
              </div>
            </button>
            <button
              aria-label={
                record.isFavorite
                  ? "Remove conversation from favorites"
                  : "Add conversation to favorites"
              }
              className="desktop-ai-dock__favorite"
              data-active={record.isFavorite ? "true" : "false"}
              onClick={() => onToggleFavorite(record)}
              type="button"
            >
              {record.isFavorite ? "★" : "☆"}
            </button>
          </article>
        ))}
      </div>

        <div className="desktop-ai-dock__history-detail">
          {selectedRecord ? (
            <>
              <div className="desktop-ai-dock__history-detail-header">
                <div>
                  <p className="desktop-ai-dock__eyebrow">{selectedRecord.provider}</p>
                  <h3>{selectedRecord.title}</h3>
                </div>
                <span>{formatHistoryDate(selectedRecord.modifiedAt)}</span>
              </div>
              <p className="desktop-ai-dock__history-notes">{selectedRecord.notes}</p>
              <pre className="desktop-ai-dock__history-content">
                {selectedRecord.content}
              </pre>
            </>
          ) : (
            <div className="desktop-ai-dock__empty-state">
              <strong>Select a saved conversation</strong>
              <p>The markdown transcript preview will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
