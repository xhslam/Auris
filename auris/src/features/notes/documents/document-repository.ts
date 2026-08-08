import type { NoteDocument, ParsedNoteIndex } from "@/features/notes/documents/document-types";
import { parseFrontmatterDocument } from "@/features/notes/documents/frontmatter";
import { buildMarkdownIndex } from "@/features/notes/documents/markdown-index";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { getVaultBasename, getVaultFileName } from "@/features/notes/vault/vault-path";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";

const MAX_UNKNOWN_TEXT_CONTROL_RATIO = 0.02;
const MAX_UNKNOWN_TEXT_REPLACEMENT_RATIO = 0.01;

export function isProbablyTextContent(source: string) {
  if (source.length === 0) {
    return true;
  }

  if (source.includes("\u0000")) {
    return false;
  }

  let controlCharacters = 0;
  let replacementCharacters = 0;

  for (const character of source) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (character === "\uFFFD") {
      replacementCharacters += 1;
    }

    if (
      (codePoint >= 0 && codePoint < 0x09) ||
      (codePoint > 0x0d && codePoint < 0x20)
    ) {
      controlCharacters += 1;
    }
  }

  return (
    controlCharacters / source.length <= MAX_UNKNOWN_TEXT_CONTROL_RATIO &&
    replacementCharacters / source.length <= MAX_UNKNOWN_TEXT_REPLACEMENT_RATIO
  );
}

function normalizeTagValue(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/^#+/, "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function extractFrontmatterTags(
  frontmatter: Record<string, unknown>,
): string[] {
  const raw = frontmatter.tags ?? frontmatter.tag;

  if (raw === undefined || raw === null) {
    return [];
  }

  const candidates = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\s]+/)
      : [raw];

  const tags: string[] = [];

  candidates.forEach((candidate) => {
    const normalized = normalizeTagValue(candidate);

    if (normalized) {
      tags.push(normalized);
    }
  });

  return tags;
}

function mergeTags(bodyTags: string[], frontmatterTags: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  [...bodyTags, ...frontmatterTags].forEach((tag) => {
    const key = tag.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(tag);
  });

  return merged;
}

function mergeParsedIndex(
  path: string,
  frontmatter: Record<string, unknown>,
  parsed: ParsedNoteIndex,
): ParsedNoteIndex {
  const frontmatterTitle = typeof frontmatter.title === "string" ? frontmatter.title.trim() : null;

  return {
    ...parsed,
    tags: mergeTags(parsed.tags, extractFrontmatterTags(frontmatter)),
    title: frontmatterTitle || parsed.title || getVaultBasename(path),
  };
}

export function createNoteDocument(input: {
  mtime: string | null;
  path: string;
  rawSource: string;
}): NoteDocument {
  const format = getFormatDescriptor(input.path);
  const basename = getVaultFileName(input.path).replace(/\.[^.]+$/u, "");

  if (format.id !== "markdown") {
    return {
      basename,
      fileName: getVaultFileName(input.path),
      formatId: format.id,
      frontmatter: {},
      mtime: input.mtime,
      parsed: {
        backlinks: [],
        embeds: [],
        headings: [],
        links: [],
        tags: [],
        tasks: [],
        title: basename,
        wordCount: 0,
      },
      path: input.path,
      rawSource: input.rawSource,
    };
  }

  const frontmatterDocument = parseFrontmatterDocument(input.rawSource);
  const baseIndex = buildMarkdownIndex(frontmatterDocument.bodySource);

  return {
    basename: getVaultBasename(input.path),
    fileName: getVaultFileName(input.path),
    formatId: format.id,
    frontmatter: frontmatterDocument.frontmatter,
    mtime: input.mtime,
    parsed: {
      ...mergeParsedIndex(input.path, frontmatterDocument.frontmatter, baseIndex),
      backlinks: [],
    },
    path: input.path,
    rawSource: input.rawSource,
  };
}

export async function loadNoteDocument(
  client: VaultClient,
  entry: Pick<VaultEntry, "mtime" | "path">,
) {
  const rawSource = await client.readFile(entry.path);

  if (rawSource === null) {
    return null;
  }

  const format = getFormatDescriptor(entry.path);

  if (format.id === "unknown-text" && !isProbablyTextContent(rawSource)) {
    return null;
  }

  return createNoteDocument({
    mtime: entry.mtime,
    path: entry.path,
    rawSource,
  });
}
