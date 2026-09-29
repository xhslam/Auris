import { createNotesMarkdownProcessor } from "@/features/notes/markdown/notes-markdown-dialect";
import { assertNotesMarkdownNestingSafe } from "@/features/notes/markdown/notes-markdown-nesting";
import type { NoteHeadingIndex } from "@/features/notes/documents/document-types";

export type MarkdownLinkTarget =
  | { kind: "blocked"; reason: "empty" | "invalid-url" | "network-path" | "relative-without-source" | "root-escape" | "unsafe-scheme" }
  | { kind: "external"; href: string }
  | { kind: "file"; fragment: string; path: string }
  | { kind: "fragment"; fragment: string };

const URI_SCHEME_RE = /^([a-z][a-z\d+.-]*):/i;
const WINDOWS_ABSOLUTE_RE = /^[a-z]:[\\/]/i;
const WINDOWS_DRIVE_RELATIVE_RE = /^[a-z]:[^\\/]/i;
const SAFE_EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function decodePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeAbsolutePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const windows = WINDOWS_ABSOLUTE_RE.test(normalized);
  const root = windows ? `${normalized.slice(0, 2)}/` : "/";
  const tail = windows ? normalized.slice(3) : normalized.slice(1);
  const segments: string[] = [];

  for (const segment of tail.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `${root}${segments.join("/")}`;
}

function normalizeRelativePath(value: string) {
  const segments: string[] = [];

  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

function decodeFragment(value: string) {
  return decodePart(value);
}

/**
 * Resolve a Markdown link without letting renderer-relative URL handling turn
 * a local path into an app-origin URL. Relative links use the source file's
 * directory; POSIX and drive-rooted paths remain absolute. UNC and
 * drive-relative paths are refused before they can reach the OS.
 */
export function resolveMarkdownLinkTarget(
  rawHref: string,
  sourcePath: string | null,
): MarkdownLinkTarget {
  const href = rawHref.trim();
  if (!href) return { kind: "blocked", reason: "empty" };

  if (href.startsWith("\\\\") || href.startsWith("//")) {
    return { kind: "blocked", reason: "network-path" };
  }

  const hashIndex = href.indexOf("#");
  const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const fragment = hashIndex >= 0 ? decodeFragment(href.slice(hashIndex + 1)) : "";

  if (!pathPart) return { kind: "fragment", fragment };

  if (WINDOWS_DRIVE_RELATIVE_RE.test(pathPart)) {
    return { kind: "blocked", reason: "unsafe-scheme" };
  }

  const scheme = WINDOWS_ABSOLUTE_RE.test(pathPart)
    ? null
    : URI_SCHEME_RE.exec(pathPart)?.[1]?.toLowerCase();
  if (scheme) {
    if (!SAFE_EXTERNAL_SCHEMES.has(`${scheme}:`)) {
      return { kind: "blocked", reason: "unsafe-scheme" };
    }
    try {
      const parsed = new URL(href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (!parsed.hostname) return { kind: "blocked", reason: "invalid-url" };
      }
      return { kind: "external", href: parsed.toString() };
    } catch {
      return { kind: "blocked", reason: "invalid-url" };
    }
  }

  const decodedPathRaw = decodePart(pathPart);
  if (decodedPathRaw.startsWith("\\") && !decodedPathRaw.startsWith("\\\\")) {
    return { kind: "blocked", reason: "unsafe-scheme" };
  }
  const decodedPath = decodedPathRaw.replace(/\\/g, "/");
  if (decodedPath.startsWith("//")) {
    return { kind: "blocked", reason: "network-path" };
  }
  if (decodedPath.startsWith("\\")) {
    return { kind: "blocked", reason: "unsafe-scheme" };
  }

  if (decodedPath.startsWith("/") || WINDOWS_ABSOLUTE_RE.test(decodedPath)) {
    return {
      kind: "file",
      fragment,
      path: normalizeAbsolutePath(decodedPath),
    };
  }

  if (!sourcePath) {
    return { kind: "blocked", reason: "relative-without-source" };
  }

  const normalizedSource = sourcePath.replace(/\\/g, "/");
  if (WINDOWS_DRIVE_RELATIVE_RE.test(normalizedSource)) {
    return { kind: "blocked", reason: "unsafe-scheme" };
  }

  if (normalizedSource.startsWith("/") || WINDOWS_ABSOLUTE_RE.test(normalizedSource)) {
    const source = normalizeAbsolutePath(normalizedSource);
    const sourceDirectory = source.slice(0, source.lastIndexOf("/"));
    return {
      kind: "file",
      fragment,
      path: normalizeAbsolutePath(`${sourceDirectory}/${decodedPath}`),
    };
  }

  const sourceDirectory = normalizedSource.includes("/")
    ? normalizedSource.slice(0, normalizedSource.lastIndexOf("/"))
    : "";
  const relativePath = normalizeRelativePath(`${sourceDirectory}/${decodedPath}`);
  if (relativePath === null) return { kind: "blocked", reason: "root-escape" };

  return { kind: "file", fragment, path: relativePath };
}

/** Return a vault-relative path only when an absolute target stays in its root. */
export function getVaultRelativeMarkdownPath(
  targetPath: string,
  vaultRoot: string | null,
) {
  if (!vaultRoot) return null;

  const target = targetPath.replace(/\\/g, "/").replace(/\/+$/u, "");
  const root = vaultRoot.replace(/\\/g, "/").replace(/\/+$/u, "");
  const caseInsensitive = WINDOWS_ABSOLUTE_RE.test(target) && WINDOWS_ABSOLUTE_RE.test(root);
  const normalizedTarget = caseInsensitive ? target.toLowerCase() : target;
  const normalizedRoot = caseInsensitive ? root.toLowerCase() : root;
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;

  if (!normalizedTarget.startsWith(prefix)) return null;
  return target.slice(prefix.length);
}

export function isMarkdownLinkPath(value: string) {
  return /\.(?:md|markdown|mdown|mkd|mkdn|mdx)$/i.test(value);
}

export function findMarkdownHeadingLine(
  headings: readonly NoteHeadingIndex[],
  fragment: string,
) {
  const normalizedFragment = fragment
    .trim()
    .replace(/^#/u, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
  return headings.find((heading) => heading.slug === normalizedFragment)?.line ?? null;
}

export type MarkdownSourceLink = { href: string; from: number; to: number };

/** Find the Markdown link under a source-editor character offset. */
export function findMarkdownSourceLinkAt(
  sourceLine: string,
  offset: number,
): MarkdownSourceLink | null {
  type PositionedLink = {
    children?: PositionedLink[];
    position?: { end?: { offset?: number }; start?: { offset?: number } };
    title?: string | null;
    type: string;
    url?: string;
  };

  let tree: PositionedLink;
  try {
    assertNotesMarkdownNestingSafe(sourceLine);
    tree = createNotesMarkdownProcessor().parse(sourceLine) as unknown as PositionedLink;
  } catch {
    return null;
  }

  const links: MarkdownSourceLink[] = [];
  const visit = (node: PositionedLink) => {
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (
      node.type === "link" &&
      typeof node.url === "string" &&
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      offset >= from! &&
      offset < to!
    ) {
      links.push({ href: node.url, from: from!, to: to! });
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return links.sort((left, right) => left.to - left.from - (right.to - right.from))[0] ?? null;
}
