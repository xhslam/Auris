"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { HomePage } from "@/components/home/home-page";
import type { NotePageSummary, NotesStorage } from "@/features/notes/note-types";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";

type DesktopHomeShellProps = {
  notesStorage?: NotesStorage | null;
  onPrimaryActionNavigate?: (href: string) => void;
};

export function DesktopHomeShell({
  notesStorage: notesStorageProp,
  onPrimaryActionNavigate,
}: DesktopHomeShellProps) {
  const router = useRouter();
  const notesStorage = useMemo(
    () => notesStorageProp ?? getNotesStorage(),
    [notesStorageProp],
  );
  const [recentNotes, setRecentNotes] = useState<NotePageSummary[]>([]);

  const navigate = useCallback(
    (href: string) => {
      if (onPrimaryActionNavigate) {
        onPrimaryActionNavigate(href);
        return;
      }

      startTransition(() => {
        router.push(href);
      });
    },
    [onPrimaryActionNavigate, router],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRecentNotes() {
      if (!notesStorage) {
        return;
      }

      try {
        const pages = await notesStorage.listPages();

        if (!cancelled) {
          setRecentNotes(
            [...pages]
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .slice(0, 8),
          );
        }
      } catch {
        if (!cancelled) {
          setRecentNotes([]);
        }
      }
    }

    void loadRecentNotes();

    return () => {
      cancelled = true;
    };
  }, [notesStorage]);

  useEffect(() => {
    // Eagerly compiling every large workspace route can exhaust the Next.js
    // development server heap. Development already compiles routes on demand;
    // keep the warm-up optimization for production builds only.
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    router.prefetch("/notes");
    router.prefetch("/reading");
    router.prefetch("/review");
    router.prefetch("/flash");
    router.prefetch("/video");
  }, [router]);

  return (
    <DesktopAppFrame
      activeNavId="home"
      activeWorkspace="home"
      subtitle="Home"
      title="首页"
    >
      <HomePage onNavigate={navigate} recentNotes={recentNotes} />
    </DesktopAppFrame>
  );
}
