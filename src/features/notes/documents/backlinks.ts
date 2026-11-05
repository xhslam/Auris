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

export function buildTargetLookup(documents: NoteDocument[]) {
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

/**
 * Builds a resolver that maps a link target to the note path it points at,
 * sharing one target lookup across every call.
 *
 * `resolveBacklinkTargetPath` rebuilds the lookup on each call, which is fine
 * for a one-off resolution but quadratic when a caller resolves every link in
 * the vault (the relationship graph does exactly that). `createWikiLinkResolver`
 * already shares a lookup but answers only yes/no, so it cannot be used to
 * build edges. This is the shared-lookup, path-returning form both of them are
 * expressed in terms of.
 */
export function createBacklinkTargetResolver(documents: NoteDocument[]) {
  const lookup = buildTargetLookup(documents);

  return (rawTarget: string, sourcePath = ""): string | null => {
    const target = parseWikiLinkTarget(rawTarget);

    if (!target) {
      return null;
    }

    return resolveBacklinkTargetPathFromLookup(target, sourcePath, lookup);
  };
}

export type BacklinkTargetResolver = ReturnType<typeof createBacklinkTargetResolver>;

export function resolveBacklinkTargetPathFromLookup(
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
  const resolve = createBacklinkTargetResolver(documents);

  return (rawTarget: string, sourcePath = ""): boolean =>
    resolve(rawTarget, sourcePath) !== null;
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

export type WikiLinkTargetIndex = {
  lookup: Map<string, string>;
  version: string;
  resolver: (rawTarget: string, sourcePath?: string) => string | null;
  wikiLinkExists: (rawTarget: string, sourcePath?: string) => boolean;
};

function computeTargetLookupFingerprint(lookup: Map<string, string>): string {
  const sortedKeys = Array.from(lookup.keys()).sort();
  let hash = 0;
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const val = lookup.get(key) ?? "";
    for (let j = 0; j < key.length; j++) {
      hash = (hash * 31 + key.charCodeAt(j)) | 0;
    }
    for (let j = 0; j < val.length; j++) {
      hash = (hash * 31 + val.charCodeAt(j)) | 0;
    }
  }
  return `${lookup.size}:${hash}`;
}

export function buildWikiLinkTargetIndex(
  documents: NoteDocument[],
  previousIndex?: WikiLinkTargetIndex | null,
): WikiLinkTargetIndex {
  const lookup = buildTargetLookup(documents);
  const version = computeTargetLookupFingerprint(lookup);

  if (previousIndex && previousIndex.version === version) {
    return previousIndex;
  }

  const resolver = (rawTarget: string, sourcePath = ""): string | null => {
    const target = parseWikiLinkTarget(rawTarget);
    if (!target) return null;
    return resolveBacklinkTargetPathFromLookup(target, sourcePath, lookup);
  };

  const wikiLinkExists = (rawTarget: string, sourcePath = ""): boolean =>
    resolver(rawTarget, sourcePath) !== null;

  return {
    lookup,
    resolver,
    version,
    wikiLinkExists,
  };
}

export type UpdateBacklinksIndexOptions = {
  changedDocuments: NoteDocument[];
  previousDocumentsByPath: Map<string, NoteDocument>;
  targetLookup: Map<string, string>;
  targetTopologyChanged?: boolean;
  allDocuments?: NoteDocument[];
};

export function updateBacklinksIndex(
  previousIndex: Record<string, string[]>,
  options: UpdateBacklinksIndexOptions,
): Record<string, string[]> {
  const {
    allDocuments,
    changedDocuments,
    previousDocumentsByPath,
    targetLookup,
    targetTopologyChanged,
  } = options;

  if (targetTopologyChanged) {
    return buildBacklinksIndex(allDocuments ?? changedDocuments);
  }

  const nextIndex = { ...previousIndex };
  let anyChanged = false;

  for (const newDoc of changedDocuments) {
    const oldDoc = previousDocumentsByPath.get(newDoc.path);
    const oldTargets = new Set<string>();

    if (oldDoc) {
      oldDoc.parsed.links.forEach((link) => {
        const targetPath = resolveBacklinkTargetPathFromLookup(
          link.target,
          oldDoc.path,
          targetLookup,
        );
        if (targetPath && targetPath !== oldDoc.path) {
          oldTargets.add(targetPath);
        }
      });
    }

    const newTargets = new Set<string>();
    newDoc.parsed.links.forEach((link) => {
      const targetPath = resolveBacklinkTargetPathFromLookup(
        link.target,
        newDoc.path,
        targetLookup,
      );
      if (targetPath && targetPath !== newDoc.path) {
        newTargets.add(targetPath);
      }
    });

    let targetsDiffer = false;
    if (oldTargets.size !== newTargets.size) {
      targetsDiffer = true;
    } else {
      for (const t of newTargets) {
        if (!oldTargets.has(t)) {
          targetsDiffer = true;
          break;
        }
      }
    }

    if (!targetsDiffer) {
      continue;
    }

    // Removed outgoing targets
    for (const oldTarget of oldTargets) {
      if (!newTargets.has(oldTarget)) {
        const currentList = nextIndex[oldTarget] ?? [];
        const filtered = currentList.filter((p) => p !== newDoc.path);
        if (filtered.length !== currentList.length) {
          nextIndex[oldTarget] = filtered;
          anyChanged = true;
        }
      }
    }

    // Added outgoing targets
    for (const newTarget of newTargets) {
      if (!oldTargets.has(newTarget)) {
        const currentList = nextIndex[newTarget] ?? [];
        if (!currentList.includes(newDoc.path)) {
          nextIndex[newTarget] = [...currentList, newDoc.path];
          anyChanged = true;
        }
      }
    }
  }

  return anyChanged ? nextIndex : previousIndex;
}
