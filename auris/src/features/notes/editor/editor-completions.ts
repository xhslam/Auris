import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesEditorEnvironment } from "@/features/notes/editor/editor-types";
import { resolveSlashCommandMatches } from "@/features/notes/note-model";
import { getVaultBasename, normalizeVaultPath } from "@/features/notes/vault/vault-path";

function buildResult(from: number, options: Completion[]): CompletionResult {
  return {
    from,
    options,
  };
}

function sortDocumentsByTitle(documents: NoteDocument[]) {
  return [...documents].sort((left, right) => {
    const leftTitle = left.parsed.title ?? left.basename;
    const rightTitle = right.parsed.title ?? right.basename;

    return leftTitle.localeCompare(rightTitle);
  });
}

function buildDuplicateBaseNameCounts(documents: NoteDocument[]) {
  return documents.reduce<Map<string, number>>((counts, document) => {
    const key = getVaultBasename(document.path).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
}

function buildWikiLinkTarget(
  document: NoteDocument,
  duplicateBaseNameCounts: Map<string, number>,
) {
  const basename = getVaultBasename(document.path);
  const normalizedPath = normalizeVaultPath(document.path).replace(/\.md$/i, "");

  if ((duplicateBaseNameCounts.get(basename.toLowerCase()) ?? 0) > 1) {
    return normalizedPath;
  }

  return basename;
}

export function buildWikiLinkOptions(documents: NoteDocument[]) {
  const duplicateBaseNameCounts = buildDuplicateBaseNameCounts(documents);

  return sortDocumentsByTitle(documents).map((document) => {
    const target = buildWikiLinkTarget(document, duplicateBaseNameCounts);

    return {
      apply: `[[${target}]]`,
      detail: document.path,
      label: document.parsed.title ?? document.basename,
      type: "text" as const,
    };
  });
}

export function buildTagOptions(documents: NoteDocument[]) {
  return Array.from(
    new Set(documents.flatMap((document) => document.parsed.tags)),
  )
    .sort((left, right) => left.localeCompare(right))
    .map((tag) => ({
      apply: `#${tag}`,
      label: tag,
      type: "keyword" as const,
    }));
}

export function buildSlashCommandOptions(query: string) {
  return resolveSlashCommandMatches(query).map((command) => ({
    apply: command.snippet,
    detail: command.description,
    label: command.label,
    type: "keyword" as const,
  }));
}

function buildCompletionResult(
  before: { from: number },
  options: Completion[],
) {
  return options.length > 0 ? buildResult(before.from, options) : null;
}

export function createWikiLinkCompletionSource(environment?: NotesEditorEnvironment) {
  return (context: CompletionContext) => {
    const before = context.matchBefore(/\[\[[^\]]*$/);

    if (!before) {
      return null;
    }

    return buildCompletionResult(before, buildWikiLinkOptions(environment?.getDocuments?.() ?? []));
  };
}

export function createTagCompletionSource(environment?: NotesEditorEnvironment) {
  return (context: CompletionContext) => {
    const before = context.matchBefore(/#[\w/-]*$/);

    if (!before) {
      return null;
    }

    return buildCompletionResult(before, buildTagOptions(environment?.getDocuments?.() ?? []));
  };
}

export function createSlashCommandCompletionSource() {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const beforeCursor = line.text.slice(0, context.pos - line.from);
    const match = beforeCursor.match(/^(\s*)\/([\p{L}\p{N}_-]*)$/u);

    if (!match) {
      return null;
    }

    const options = buildSlashCommandOptions(match[2] ?? "");

    return options.length > 0
      ? buildResult(line.from + (match[1]?.length ?? 0), options)
      : null;
  };
}

export const wikiLinkCompletion = createWikiLinkCompletionSource();

export const tagCompletion = createTagCompletionSource();

export const slashCommandCompletion = createSlashCommandCompletionSource();
