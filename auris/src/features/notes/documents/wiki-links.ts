import type { NoteWikiLinkIndex } from "@/features/notes/documents/document-types";

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function parseWikiLinkToken(token: string): NoteWikiLinkIndex {
  const [targetWithHeading, aliasPart] = token.split("|");
  const [targetPart, headingPart] = targetWithHeading.split("#");

  return {
    alias: aliasPart?.trim() || null,
    heading: headingPart?.trim() || null,
    target: targetPart.trim(),
  };
}

/**
 * Extracts the navigation target from a wiki-link token. Accepts either the
 * raw token (`[[target#heading|alias]]`) or just its inner text, and returns
 * only the target part (heading/alias stripped).
 */
export function parseWikiLinkTarget(rawToken: string): string {
  return stripWikiLinkBrackets(rawToken).split("|")[0].split("#")[0].trim();
}

/**
 * Returns the visible label for a wiki-link token: the alias if present,
 * otherwise the heading, otherwise the bare target. Accepts either the raw
 * token (`[[target#heading|alias]]`) or just its inner text.
 */
export function getWikiLinkLabel(rawToken: string): string {
  const [targetWithHeading, alias] = stripWikiLinkBrackets(rawToken).split("|");
  const [target, heading] = targetWithHeading.split("#");

  return alias?.trim() || heading?.trim() || target.trim();
}

function stripWikiLinkBrackets(rawToken: string): string {
  const inner = rawToken.trim();

  return inner.startsWith("[[") && inner.endsWith("]]")
    ? inner.slice(2, -2)
    : inner;
}

export function extractWikiLinks(source: string): NoteWikiLinkIndex[] {
  const matches = source.matchAll(WIKI_LINK_PATTERN);

  return Array.from(matches, (match) => parseWikiLinkToken(match[1] ?? "")).filter(
    (link) => link.target.length > 0,
  );
}

// Matches standard markdown links like `[label](path/to/note.md)` while
// ignoring image embeds (`![...](...)`). Wiki links (`[[...]]`) never match
// because they lack the `](` sequence this pattern requires.
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const EXTERNAL_TARGET_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function normalizeMarkdownTarget(rawTarget: string): string {
  let target = rawTarget.trim();

  // Strip optional angle brackets: [x](<path with spaces.md>)
  const angled = target.match(/^<(.*)>$/);
  if (angled) {
    target = angled[1].trim();
  }

  // Strip an optional link title: [x](path.md "Title") / (path.md 'Title')
  const titled = target.match(/^(\S+)\s+["'(].*$/);
  if (titled) {
    target = titled[1];
  }

  return target;
}

// Extracts inline markdown links that point at other notes (".md" targets),
// so backlinks work for vaults that use ordinary markdown links rather than
// Obsidian-style wiki links.
export function extractMarkdownNoteLinks(source: string): NoteWikiLinkIndex[] {
  const results: NoteWikiLinkIndex[] = [];

  for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
    const isEmbed = match[1] === "!";

    if (isEmbed) {
      continue;
    }

    const alias = match[2]?.trim() || null;
    const target = normalizeMarkdownTarget(match[3] ?? "");

    if (
      !target ||
      target.startsWith("#") ||
      EXTERNAL_TARGET_PATTERN.test(target)
    ) {
      continue;
    }

    const [pathPart, headingPart] = target.split("#");

    if (!pathPart || !/\.md$/i.test(pathPart)) {
      continue;
    }

    let decodedPath = pathPart.trim();
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // Leave the raw path if it is not valid percent-encoding.
    }

    results.push({
      alias,
      heading: headingPart?.trim() || null,
      target: decodedPath,
    });
  }

  return results;
}
