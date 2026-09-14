"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";

export type NotesCommandPaletteItem = {
  id: string;
  keywords?: string[];
  subtitle?: string;
  title: string;
  onSelect: () => void;
};

type NotesCommandPaletteProps = {
  isOpen: boolean;
  items: NotesCommandPaletteItem[];
  onOpenChange: (open: boolean) => void;
};

function matchesCommand(item: NotesCommandPaletteItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [item.title, item.subtitle ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function NotesCommandPalette({
  isOpen,
  items,
  onOpenChange,
}: NotesCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const onOpenChangeRef = useRef(onOpenChange);
  const filteredItems = useMemo(
    () => items.filter((item) => matchesCommand(item, query)),
    [items, query],
  );

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChangeRef.current(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="notes-v2__palette-backdrop" role="presentation">
      <div
        aria-label={NOTES_UI_COPY.commandPalette.dialogLabel}
        className="notes-v2__palette"
        role="dialog"
      >
        <input
          autoFocus
          className="notes-v2__palette-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={NOTES_UI_COPY.commandPalette.placeholder}
          type="search"
          value={query}
        />

        <ul className="notes-v2__palette-list">
          {filteredItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  item.onSelect();
                  onOpenChange(false);
                }}
                type="button"
              >
                <strong>{item.title}</strong>
                {item.subtitle ? <span>{item.subtitle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
