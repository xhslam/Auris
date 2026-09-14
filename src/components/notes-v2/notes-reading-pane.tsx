"use client";

import { useCallback, useMemo } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { createWikiLinkResolver } from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";

type NotesReadingPaneProps = {
  document: NoteDocument | null;
  documents?: NoteDocument[];
  onOpenWikiLink?: (target: string) => void;
};

export function NotesReadingPane({
  document,
  documents,
  onOpenWikiLink,
}: NotesReadingPaneProps) {
  const sourcePath = document?.path ?? "";

  const wikiLinkExists = useMemo(() => {
    const resolve = createWikiLinkResolver(documents ?? []);
    return (target: string) => resolve(target, sourcePath);
  }, [documents, sourcePath]);

  // Render markdown → HTML whenever the source or link resolver changes
  const html = useMemo(() => {
    if (!document) return "";
    return renderMarkdown(document.rawSource, {
      wikiLinkClickable: Boolean(onOpenWikiLink),
      wikiLinkExists,
    });
  }, [document, onOpenWikiLink, wikiLinkExists]);

  // Event delegation: catch clicks on [data-wikilink-target] anchors
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!onOpenWikiLink) return;
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[data-wikilink-target]",
      );
      if (!anchor) return;
      event.preventDefault();
      const target = decodeURIComponent(anchor.dataset.wikilinkTarget ?? "");
      if (target) onOpenWikiLink(target);
    },
    [onOpenWikiLink],
  );

  if (!document) {
    return (
      <article className="notes-v2__reading-pane">
        <p className="notes-v2__empty-copy">
          {NOTES_UI_COPY.panels.reading.empty}
        </p>
      </article>
    );
  }

  return (
    <article
      className="notes-v2__reading-pane notes-v2__reading-pane--remark"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
