import { useEffect, useState } from "react";
import { isAbsoluteNotesImagePath, resolveNotesImagePath } from "@/features/notes/editor/notes-image-path";

/** Preserve document ownership paths; only media resolution uses a Vault-relative path. */
export function useNotesImagePath(path: string | null) {
  const [resolved, setResolved] = useState<{ owner: string; path: string } | null>(null);
  useEffect(() => {
    if (!path || !isAbsoluteNotesImagePath(path)) return;
    let cancelled = false;
    void resolveNotesImagePath(path).then(relative => {
      if (!cancelled) setResolved({ owner: path, path: relative });
    }).catch(() => { if (!cancelled) setResolved(null); });
    return () => { cancelled = true; };
  }, [path]);
  if (!path || !isAbsoluteNotesImagePath(path)) return path;
  return resolved?.owner === path ? resolved.path : null;
}
