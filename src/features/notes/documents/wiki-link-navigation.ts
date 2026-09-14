import { resolveBacklinkTargetPath } from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { parseWikiLinkTarget } from "@/features/notes/documents/wiki-links";
import {
  ensureMarkdownPath,
  getVaultBasename,
  normalizeVaultPath,
} from "@/features/notes/vault/vault-path";

// Canonical wiki-link token parsers live in ./wiki-links; re-exported here so
// existing call sites that import them from this module keep working.
export {
  getWikiLinkLabel,
  parseWikiLinkTarget,
} from "@/features/notes/documents/wiki-links";

export type WikiLinkNavigationPlan =
  | { type: "open"; path: string }
  | { type: "create"; path: string; title: string };

/**
 * Obsidian-style navigation plan for a wiki link: open the resolved note if it
 * exists, otherwise plan to create a new note (at the vault root, mirroring
 * Obsidian's default) and open it.
 */
export function planWikiLinkNavigation(
  rawTarget: string,
  sourcePath: string,
  documents: NoteDocument[],
): WikiLinkNavigationPlan | null {
  const target = parseWikiLinkTarget(rawTarget);

  if (!target) {
    return null;
  }

  const existingPath = resolveBacklinkTargetPath(target, sourcePath, documents);

  if (existingPath) {
    return { path: existingPath, type: "open" };
  }

  const normalizedTarget = normalizeVaultPath(target).replace(/^\.\//, "");

  if (!normalizedTarget || normalizedTarget.includes("..")) {
    return null;
  }

  const path = ensureMarkdownPath(normalizedTarget);
  const title = getVaultBasename(path) || target;

  return { path, title, type: "create" };
}

export function buildWikiLinkNoteSource(title: string) {
  return `# ${title}\n\n`;
}

/**
 * Finds the wiki-link token covering `offset` within a single line of text.
 * Returns the raw inner token (without brackets) or null.
 */
export function findWikiLinkAtLineOffset(
  lineText: string,
  offset: number,
): string | null {
  for (const match of lineText.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (offset >= start && offset <= end) {
      return match[1];
    }
  }

  return null;
}
