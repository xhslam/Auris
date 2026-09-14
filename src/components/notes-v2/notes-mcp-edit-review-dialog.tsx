"use client";

import type { BrowserEvidence } from "@/features/browser/evidence";
import type { NotesMcpPendingEdit } from "@/features/notes/workbench/notes-mcp-edit-review";

type NotesMcpEditReviewDialogProps = {
  edit: NotesMcpPendingEdit;
  onAccept: () => void;
  onReject: () => void;
};

const EXCERPT_PREVIEW_LIMIT = 280;

function getPreview(edit: NotesMcpPendingEdit) {
  if (edit.kind === "document") {
    return {
      after: edit.afterSource,
      before: edit.beforeSource,
    };
  }

  return {
    after: edit.content,
    before: edit.selection?.text || "(empty selection)",
  };
}

function getDocumentEvidence(edit: NotesMcpPendingEdit): BrowserEvidence | null {
  return edit.kind === "document" && edit.evidence ? edit.evidence : null;
}

function formatEvidenceCounts(evidence: BrowserEvidence) {
  const parts = [
    `${evidence.excerpts?.length ?? 0} excerpts`,
    `${evidence.screenshots?.length ?? 0} screenshots`,
    `${evidence.approvals?.length ?? 0} approvals`,
    `${evidence.citations?.length ?? 0} citations`,
  ];
  return parts.join(" · ");
}

function firstExcerptPreview(evidence: BrowserEvidence) {
  const text = evidence.excerpts?.[0]?.text?.trim();
  if (!text) return null;
  if (text.length <= EXCERPT_PREVIEW_LIMIT) return text;
  return `${text.slice(0, EXCERPT_PREVIEW_LIMIT)}…`;
}

export function NotesMcpEditReviewDialog({
  edit,
  onAccept,
  onReject,
}: NotesMcpEditReviewDialogProps) {
  const preview = getPreview(edit);
  const evidence = getDocumentEvidence(edit);
  const excerptPreview = evidence ? firstExcerptPreview(evidence) : null;

  return (
    <div className="notes-v2__conflict-backdrop" role="presentation">
      <section
        aria-label="MCP edit review"
        className="notes-v2__conflict-dialog"
        role="dialog"
      >
        <div className="notes-v2__conflict-header">
          <div>
            <p className="notes-v2__conflict-eyebrow">MCP edit request</p>
            <h2>Review agent edit</h2>
          </div>
          <p className="notes-v2__conflict-path">{edit.path}</p>
        </div>

        <p className="notes-v2__conflict-copy">
          An MCP client proposed a {edit.kind === "document" ? "document" : "selection"} edit.
          Review it before applying the change to your note.
        </p>

        {evidence ? (
          <div
            aria-label="Browser research evidence"
            className="notes-v2__conflict-evidence"
          >
            <strong>Browser evidence</strong>
            <dl className="notes-v2__conflict-evidence-meta">
              <div>
                <dt>Source</dt>
                <dd>{evidence.source.title || "(untitled)"}</dd>
              </div>
              <div>
                <dt>URL</dt>
                <dd>{evidence.source.finalUrl}</dd>
              </div>
              <div>
                <dt>Accessed</dt>
                <dd>{evidence.source.accessedAt}</dd>
              </div>
              <div>
                <dt>Bundle</dt>
                <dd>{formatEvidenceCounts(evidence)}</dd>
              </div>
            </dl>
            {excerptPreview ? (
              <pre aria-label="Evidence excerpt preview">{excerptPreview}</pre>
            ) : null}
          </div>
        ) : null}

        <div className="notes-v2__conflict-preview" aria-label="Before">
          <strong>Before</strong>
          <pre>{preview.before}</pre>
        </div>
        <div className="notes-v2__conflict-preview" aria-label="After">
          <strong>After</strong>
          <pre>{preview.after}</pre>
        </div>

        <div className="notes-v2__conflict-actions">
          <button onClick={onReject} type="button">
            Reject
          </button>
          <button onClick={onAccept} type="button">
            Apply edit
          </button>
        </div>
      </section>
    </div>
  );
}
