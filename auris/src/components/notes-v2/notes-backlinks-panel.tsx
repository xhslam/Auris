"use client";

import type { NoteDocument } from "@/features/notes/documents/document-types";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { resolveBacklinkTargetPath } from "@/features/notes/documents/backlinks";

type NotesBacklinksPanelProps = {
  activeDocument?: NoteDocument | null;
  backlinks: NoteDocument[];
  documents?: NoteDocument[];
  onOpenPath: (path: string) => void;
};

type BacklinkMention = {
  count: number;
  document: NoteDocument;
  excerpts: string[];
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function getUnlinkedMentionCandidates(activeDocument: NoteDocument) {
  const candidates = new Set<string>();
  const baseValues = [
    activeDocument.parsed.title,
    activeDocument.basename,
    activeDocument.fileName,
  ].filter((value): value is string => Boolean(value?.trim()));

  baseValues.forEach((value) => {
    candidates.add(normalizeSearchText(value));
    value
      .split(/[|｜:：、，,;；]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
      .forEach((part) => candidates.add(normalizeSearchText(part)));
  });

  return Array.from(candidates);
}

function getMentionLineCandidates(document: NoteDocument, activeDocument: NoteDocument | null) {
  if (!activeDocument) {
    return [];
  }

  return document.parsed.links
    .filter(
      (link) =>
        resolveBacklinkTargetPath(link.target, document.path, [
          document,
          activeDocument,
        ]) === activeDocument.path,
    )
    .map((link) => normalizeSearchText(link.target))
    .filter(Boolean);
}

function collectLinkedMentions(
  backlinks: NoteDocument[],
  activeDocument: NoteDocument | null,
) {
  return backlinks.map<BacklinkMention>((document) => {
    const candidates = getMentionLineCandidates(document, activeDocument);
    const excerpts = document.rawSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const normalizedLine = normalizeSearchText(line);

        return candidates.some((candidate) => normalizedLine.includes(candidate));
      })
      .slice(0, 3);

    return {
      count: Math.max(candidates.length, excerpts.length, 1),
      document,
      excerpts,
    };
  });
}

function collectUnlinkedMentions(
  documents: NoteDocument[],
  activeDocument: NoteDocument | null,
  backlinks: NoteDocument[],
) {
  if (!activeDocument) {
    return [];
  }

  const linkedPaths = new Set(backlinks.map((document) => document.path));
  const candidates = getUnlinkedMentionCandidates(activeDocument);

  return documents
    .filter(
      (document) =>
        document.path !== activeDocument.path && !linkedPaths.has(document.path),
    )
    .flatMap<BacklinkMention>((document) => {
      const excerpts = document.rawSource
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => {
          const normalizedLine = normalizeSearchText(line);

          return candidates.some((candidate) => normalizedLine.includes(candidate));
        })
        .slice(0, 3);

      if (excerpts.length === 0) {
        return [];
      }

      return [
        {
          count: excerpts.length,
          document,
          excerpts,
        },
      ];
    });
}

function MentionList({
  mentions,
  onOpenPath,
}: {
  mentions: BacklinkMention[];
  onOpenPath: (path: string) => void;
}) {
  return (
    <ul className="notes-v2__panel-list notes-v2__backlink-list">
      {mentions.map((mention) => (
        <li key={mention.document.path}>
          <button onClick={() => onOpenPath(mention.document.path)} type="button">
            <span className="notes-v2__backlink-title-row">
              <strong>
                {mention.document.parsed.title ?? mention.document.fileName}
              </strong>
              <small>{mention.count}</small>
            </span>
            <span>{mention.document.path}</span>
            {mention.excerpts.length > 0 ? (
              <span className="notes-v2__backlink-excerpts">
                {mention.excerpts.map((excerpt, excerptIndex) => (
                  <em key={`${mention.document.path}-${excerptIndex}`}>
                    {excerpt}
                  </em>
                ))}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NotesBacklinksPanel({
  activeDocument = null,
  backlinks,
  documents = [],
  onOpenPath,
}: NotesBacklinksPanelProps) {
  const linkedMentions = collectLinkedMentions(backlinks, activeDocument);
  const unlinkedMentions = collectUnlinkedMentions(
    documents,
    activeDocument,
    backlinks,
  );

  return (
    <section
      aria-label={NOTES_UI_COPY.panels.backlinks.title}
      className="notes-v2__panel notes-v2__panel--compact"
    >
      {linkedMentions.length > 0 ? (
        <div className="notes-v2__backlink-section">
          <p className="notes-v2__backlink-section-title">
            Linked mentions
          </p>
          <MentionList mentions={linkedMentions} onOpenPath={onOpenPath} />
        </div>
      ) : (
        <p className="notes-v2__empty-copy">
          {NOTES_UI_COPY.panels.backlinks.empty}
        </p>
      )}
      {unlinkedMentions.length > 0 ? (
        <div className="notes-v2__backlink-section">
          <p className="notes-v2__backlink-section-title">
            Unlinked mentions
          </p>
          <MentionList mentions={unlinkedMentions} onOpenPath={onOpenPath} />
        </div>
      ) : null}
    </section>
  );
}
