"use client";

import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";
import type { NotesEditorSelectionState } from "@/features/notes/editor/editor-types";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";

type NotesPropertiesPanelProps = {
  document: NoteDocument | null;
  editorMode?: NotesEditorMode;
  openStrategy?: NoteOpenStrategy | null;
  selection?: NotesEditorSelectionState | null;
};

function formatFrontmatterValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return JSON.stringify(value);
}

export function NotesPropertiesPanel({
  document,
  editorMode = "wysiwyg",
  openStrategy = null,
  selection = null,
}: NotesPropertiesPanelProps) {
  return (
    <section
      aria-label={NOTES_UI_COPY.panels.properties.title}
      className="notes-v2__panel notes-v2__panel--compact"
    >
      {document ? (
        <dl className="notes-v2__property-list">
          <div>
            <dt>{NOTES_UI_COPY.panels.properties.path}</dt>
            <dd>{document.path}</dd>
          </div>
          <div>
            <dt>{NOTES_UI_COPY.panels.properties.words}</dt>
            <dd>{document.parsed.wordCount}</dd>
          </div>
          <div>
            <dt>{NOTES_UI_COPY.panels.properties.editorMode}</dt>
            <dd>{editorMode === "wysiwyg" ? NOTES_UI_COPY.toolbar.richText : NOTES_UI_COPY.toolbar.source}</dd>
          </div>
          <div>
            <dt>{NOTES_UI_COPY.panels.properties.size}</dt>
            <dd>{document.rawSource.length.toLocaleString()} bytes</dd>
          </div>
          {openStrategy ? (
            <div>
              <dt>{NOTES_UI_COPY.panels.properties.openStrategy}</dt>
              <dd>{`${openStrategy.label} - ${openStrategy.reason}`}</dd>
            </div>
          ) : null}
          {selection ? (
            <div>
              <dt>{NOTES_UI_COPY.panels.properties.selection}</dt>
              <dd>
                {selection.text
                  ? `${selection.text.length} chars, line ${selection.line + 1}`
                  : NOTES_UI_COPY.panels.properties.selectionEmpty}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{NOTES_UI_COPY.panels.properties.tags}</dt>
            <dd>
              {document.parsed.tags.length > 0
                ? document.parsed.tags.join(", ")
                : NOTES_UI_COPY.panels.properties.none}
            </dd>
          </div>
          {Object.entries(document.frontmatter).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{formatFrontmatterValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="notes-v2__empty-copy">
          {NOTES_UI_COPY.panels.properties.empty}
        </p>
      )}
    </section>
  );
}
