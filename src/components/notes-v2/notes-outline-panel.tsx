"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesOutlinePanelProps = {
  activeLine?: number;
  document: NoteDocument | null;
  onJumpToHeading?: (line: number) => void;
};

function getActiveHeadingLine(document: NoteDocument, activeLine: number) {
  return (
    document.parsed.headings
      .filter((heading) => heading.line <= activeLine)
      .at(-1)?.line ??
    document.parsed.headings[0]?.line ??
    null
  );
}

export function NotesOutlinePanel({
  activeLine = 0,
  document,
  onJumpToHeading,
}: NotesOutlinePanelProps) {
  const activeHeadingLine = document
    ? getActiveHeadingLine(document, activeLine)
    : null;

  return (
    <section className="notes-v2__panel">
      <div className="notes-v2__panel-heading">
        <h3>{NOTES_UI_COPY.panels.outline.title}</h3>
        <p>{NOTES_UI_COPY.panels.outline.description}</p>
      </div>

      {document?.parsed.headings.length ? (
        <ul className="notes-v2__panel-list">
          {document.parsed.headings.map((heading) => (
            <li key={`${heading.slug}-${heading.line}`}>
              <button
                className="notes-v2__outline-button"
                data-active={
                  activeHeadingLine === heading.line ? "true" : "false"
                }
                onClick={() => onJumpToHeading?.(heading.line)}
                style={{
                  paddingInlineStart: `${12 + (heading.depth - 1) * 14}px`,
                }}
                type="button"
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.outline.empty}</p>
      )}
    </section>
  );
}
