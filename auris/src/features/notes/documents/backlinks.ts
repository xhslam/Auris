import type { NoteDocument } from "@/features/notes/documents/document-types";
import { parseWikiLinkTarget } from "@/features/notes/documents/wiki-links";
import {
  ensureMarkdownPath,
  getVaultBasename,
  getVaultFileName,
  getVaultParentPath,
  normalizeVaultPath,
} from "@/features/notes/vault/vault-path";

function normalizeLookupKey(value: string) {
  return normalizeVaultPath(value).replace(/^\.\//, "").toLowerCase();
}

function getFrontmatterAliases(document: NoteDocument) {
  const rawAliases = document.frontmatter.aliases ?? document.frontmatter.alias;
  const aliases = Array.isArray(rawAliases) ? rawAliases : [rawAliases];

  return aliases
    .filter((alias): alias is string => typeof alias === "string")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function addLookupEntry(
  lookup: Map<string, string>,
  key: string,
  path: string,
) {
  const normalizedKey = normalizeLookupKey(key);

  if (!normalizedKey || lookup.has(normalizedKey)) {
    return;
  }

  lookup.set(normalizedKey, path);
}

function buildTargetLookup(documents: NoteDocument[]) {
  const lookup = new Map<string, string>();

  documents.forEach((document) => {
    addLookupEntry(lookup, document.path, document.path);
    addLookupEntry(lookup, ensureMarkdownPath(document.path), document.path);
    addLookupEntry(lookup, getVaultFileName(document.path), document.path);
    addLookupEntry(lookup, getVaultBasename(document.path), document.path);
    addLookupEntry(lookup, document.parsed.title ?? "", document.path);
    getFrontmatterAliases(document).forEach((alias) =>
      addLookupEntry(lookup, alias, document.path),
    );
  });

  return lookup;
}

function resolveVaultPath(path: string) {
  const segments: string[] = [];

  normalizeVaultPath(path)
    .split("/")
    .filter(Boolean)
    .forEach((segment) => {
      if (segment === ".") {
        return;
      }

      if (segment === "..") {
        segments.pop();
        return;
      }

      segments.push(segment);
    });

  return segments.join("/");
}

function getCandidateTargets(target: string, sourcePath: string) {
  const normalizedTarget = normalizeVaultPath(target);
  const sourceParent = getVaultParentPath(sourcePath);
  const relativeTarget = sourceParent
    ? resolveVaultPath(`${sourceParent}/${normalizedTarget}`)
    : resolveVaultPath(normalizedTarget);

  return [
    normalizedTarget,
    ensureMarkdownPath(normalizedTarget),
    getVaultFileName(normalizedTarget),
    getVaultBasename(normalizedTarget),
    relativeTarget,
    ensureMarkdownPath(relativeTarget),
  ];
}

export function resolveBacklinkTargetPath(
  target: string,
  sourcePath: string,
  documents: NoteDocument[],
) {
  const lookup = buildTargetLookup(documents);

  return resolveBacklinkTargetPathFromLookup(target, sourcePath, lookup);
}

function resolveBacklinkTargetPathFromLookup(
  target: string,
  sourcePath: string,
  lookup: Map<string, string>,
) {
  for (const candidate of getCandidateTargets(target, sourcePath)) {
    const targetPath = lookup.get(normalizeLookupKey(candidate));

    if (targetPath) {
      return targetPath;
    }
  }

  return null;
}

/**
 * Builds a reusable resolver that reports whether a wiki-link target points at
 * an existing note. The target lookup is computed once and shared across calls,
 * so rendering layers can cheaply colour links as resolved vs unresolved.
 */
export function createWikiLinkResolver(documents: NoteDocument[]) {
  const lookup = buildTargetLookup(documents);

  return (rawTarget: string, sourcePath = ""): boolean => {
    const target = parseWikiLinkTarget(rawTarget);

    if (!target) {
      return false;
    }

    return (
      resolveBacklinkTargetPathFromLookup(target, sourcePath, lookup) !== null
    );
  };
}

export type WikiLinkResolver = ReturnType<typeof createWikiLinkResolver>;

export function buildBacklinksIndex(documents: NoteDocument[]) {
  const lookup = buildTargetLookup(documents);
  const backlinks = Object.fromEntries(documents.map((document) => [document.path, [] as string[]]));

  documents.forEach((document) => {
    document.parsed.links.forEach((link) => {
      const targetPath = resolveBacklinkTargetPathFromLookup(
        link.target,
        document.path,
        lookup,
      );

      if (!targetPath || targetPath === document.path) {
        return;
      }

      const current = backlinks[targetPath] ?? [];

      if (!current.includes(document.path)) {
        backlinks[targetPath] = [...current, document.path];
      }
    });
  });

  return backlinks;
}
