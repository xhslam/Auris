import { ensureMarkdownPath, getVaultBasename, normalizeVaultPath } from "@/features/notes/vault/vault-path";

type RenameWikiLinksInput = {
  fromPath: string;
  toPath: string;
};

function buildTargetVariants(path: string) {
  const normalized = normalizeVaultPath(path);
  const markdown = ensureMarkdownPath(normalized);
  const basename = getVaultBasename(normalized);

  return Array.from(
    new Set([normalized, markdown, normalized.replace(/\.md$/i, ""), basename]),
  ).filter(Boolean);
}

function buildReplacementTarget(path: string, originalTarget: string) {
  const normalizedTarget = normalizeVaultPath(originalTarget);
  const preserveExtension = normalizedTarget.toLowerCase().endsWith(".md");
  const normalizedPath = normalizeVaultPath(path);

  if (preserveExtension) {
    return ensureMarkdownPath(normalizedPath);
  }

  return normalizedPath.replace(/\.md$/i, "");
}

export function renameWikiLinks(source: string, input: RenameWikiLinksInput) {
  const targetVariants = buildTargetVariants(input.fromPath);

  return source.replace(/\[\[([^[\]]+)\]\]/g, (fullMatch, content: string) => {
    const [rawTarget, rawAlias] = content.split("|");
    const [targetPath, heading] = rawTarget.split("#");
    const normalizedTarget = normalizeVaultPath(targetPath);
    const targetBasename = getVaultBasename(normalizedTarget);
    const matchesTarget = targetVariants.some(
      (variant) => {
        const normalizedVariant = normalizeVaultPath(variant).toLowerCase();
        return (
          normalizedTarget.toLowerCase() === normalizedVariant ||
          ensureMarkdownPath(normalizedTarget).toLowerCase() === ensureMarkdownPath(normalizedVariant).toLowerCase() ||
          targetBasename.toLowerCase() === getVaultBasename(normalizedVariant).toLowerCase()
        );
      },
    );

    if (!matchesTarget) {
      return fullMatch;
    }

    const replacementTarget = buildReplacementTarget(input.toPath, rawTarget);
    const headingSuffix = heading ? `#${heading}` : "";
    const aliasSuffix = rawAlias ? `|${rawAlias}` : "";

    return `[[${replacementTarget}${headingSuffix}${aliasSuffix}]]`;
  });
}

export function renameWikiLinksInDocuments(
  documents: Array<{ path: string; rawSource: string }>,
  input: RenameWikiLinksInput,
) {
  return documents.map((document) => ({
    ...document,
    rawSource: renameWikiLinks(document.rawSource, input),
  }));
}
