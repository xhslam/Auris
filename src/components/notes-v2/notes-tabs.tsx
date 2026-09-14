"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useNotesTabOverflow } from "@/components/notes-v2/use-notes-tab-overflow";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesTabsProps = {
  activePath: string | null;
  documents: NoteDocument[];
  onClosePath?: (path: string) => void;
  onOpenPath: (path: string) => void;
};

export function NotesTabs({
  activePath,
  documents,
  onClosePath,
  onOpenPath,
}: NotesTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const overflow = useNotesTabOverflow(stripRef);

  useEffect(() => {
    tabRefs.current.get(activePath ?? "")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activePath]);

  const scrollByPage = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(160, strip.clientWidth * 0.75),
    });
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(documents.length - 1, index + 1);
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = documents.length - 1;
    if (nextIndex === null || nextIndex === index) return;

    event.preventDefault();
    const next = documents[nextIndex];
    if (!next) return;
    onOpenPath(next.path);
    tabRefs.current.get(next.path)?.focus();
  };

  return (
    <div className="notes-v2__tabs-shell">
      <button
        aria-label={NOTES_UI_COPY.tabs.scrollLeft}
        className="notes-v2__tabs-scroll"
        disabled={!overflow.canScrollLeft}
        onClick={() => scrollByPage(-1)}
        type="button"
      >
        ‹
      </button>
      <div
        aria-label={NOTES_UI_COPY.tabs.openTabs}
        className="notes-v2__tabs"
        ref={stripRef}
        role="tablist"
      >
        <div className="notes-v2__tabs-track">
          {documents.map((document, index) => {
            const active = activePath === document.path;
            const label = document.parsed.title ?? document.fileName;
            return (
              <div className="notes-v2__tab-shell" key={document.path}>
                <button
                  aria-selected={active}
                  className="notes-v2__tab"
                  data-active={active ? "true" : "false"}
                  onClick={() => onOpenPath(document.path)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  ref={(node) => {
                    if (node) tabRefs.current.set(document.path, node);
                    else tabRefs.current.delete(document.path);
                  }}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  title={label}
                  type="button"
                >
                  {label}
                </button>

                {onClosePath ? (
                  <button
                    aria-label={`${NOTES_UI_COPY.tabs.closePrefix} ${label}`}
                    className="notes-v2__tab-close"
                    onClick={() => onClosePath(document.path)}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <button
        aria-label={NOTES_UI_COPY.tabs.scrollRight}
        className="notes-v2__tabs-scroll"
        disabled={!overflow.canScrollRight}
        onClick={() => scrollByPage(1)}
        type="button"
      >
        ›
      </button>
    </div>
  );
}
