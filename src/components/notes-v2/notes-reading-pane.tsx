"use client";

import { useCallback, useMemo } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { createWikiLinkResolver } from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";
import type { NotesMarkdownLinkOpenHandler } from "@/features/notes/editor/editor-types";

type NotesReadingPaneProps = {
  document: NoteDocument | null;
  documents?: NoteDocument[];
  onOpenMarkdownLink?: NotesMarkdownLinkOpenHandler;
  onOpenWikiLink?: (target: string) => void;
};

export function NotesReadingPane({
  document,
  documents,
  onOpenMarkdownLink,
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

  // Route note links through the desktop bridge instead of navigating the app webview.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[data-wikilink-target], a[href]",
      );
      if (!anchor) return;
      if (anchor.hasAttribute("data-wikilink-target")) {
        if (!onOpenWikiLink) return;
        event.preventDefault();
        let target = anchor.dataset.wikilinkTarget ?? "";
        try {
          target = decodeURIComponent(target);
        } catch {
          // Keep a malformed encoded target readable instead of throwing from a click.
        }
        if (target) onOpenWikiLink(target);
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || !onOpenMarkdownLink) return;
      event.preventDefault();
      void onOpenMarkdownLink(href, document?.path ?? null);
    },
    [document?.path, onOpenMarkdownLink, onOpenWikiLink],
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
