import type { NoteDocument } from "@/features/notes/documents/document-types";

export type ParsedSearchQuery = {
  tagFilters: string[];
  textTerms: string[];
};

export type DocumentTagSummary = {
  count: number;
  tag: string;
};

function stripTagPrefix(value: string) {
  return value.replace(/^#+/, "").trim();
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tagFilters: string[] = [];
  const textTerms: string[] = [];

  query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      const lower = token.toLowerCase();

      if (lower.startsWith("tag:")) {
        const value = stripTagPrefix(token.slice(4)).toLowerCase();

        if (value) {
          tagFilters.push(value);
        }

        return;
      }

      if (token.startsWith("#") && token.length > 1) {
        const value = stripTagPrefix(token).toLowerCase();

        if (value) {
          tagFilters.push(value);
        }

        return;
      }

      textTerms.push(lower);
    });

  return { tagFilters, textTerms };
}

function matchesTagFilters(document: NoteDocument, tagFilters: string[]) {
  if (tagFilters.length === 0) {
    return true;
  }

  const documentTags = document.parsed.tags.map((tag) => tag.toLowerCase());

  return tagFilters.every((filter) => documentTags.includes(filter));
}

function matchesTextTerm(document: NoteDocument, term: string) {
  return (
    document.path.toLowerCase().includes(term) ||
    (document.parsed.title ?? "").toLowerCase().includes(term) ||
    document.rawSource.toLowerCase().includes(term) ||
    document.parsed.tags.some((tag) => tag.toLowerCase().includes(term)) ||
    document.parsed.headings.some((heading) =>
      heading.text.toLowerCase().includes(term),
    )
  );
}

function matchesDocument(document: NoteDocument, parsed: ParsedSearchQuery) {
  if (!matchesTagFilters(document, parsed.tagFilters)) {
    return false;
  }

  return parsed.textTerms.every((term) => matchesTextTerm(document, term));
}

function scoreDocument(document: NoteDocument, parsed: ParsedSearchQuery) {
  let score = parsed.tagFilters.length * 3;
  const title = (document.parsed.title ?? "").toLowerCase();
  const path = document.path.toLowerCase();
  const body = document.rawSource.toLowerCase();

  parsed.textTerms.forEach((term) => {
    if (title.includes(term)) {
      score += 4;
    }

    if (document.parsed.headings.some((heading) => heading.text.toLowerCase().includes(term))) {
      score += 2;
    }

    if (document.parsed.tags.some((tag) => tag.toLowerCase().includes(term))) {
      score += 2;
    }

    if (path.includes(term)) {
      score += 1;
    }

    if (body.includes(term)) {
      score += 1;
    }
  });

  return score;
}

export function searchDocuments(documents: NoteDocument[], query: string) {
  const parsed = parseSearchQuery(query);

  if (parsed.tagFilters.length === 0 && parsed.textTerms.length === 0) {
    return documents;
  }

  return documents
    .filter((document) => matchesDocument(document, parsed))
    .map((document, index) => ({
      document,
      index,
      score: scoreDocument(document, parsed),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.document);
}

export function collectDocumentTags(
  documents: NoteDocument[],
): DocumentTagSummary[] {
  const counts = new Map<string, DocumentTagSummary>();

  documents.forEach((document) => {
    const seen = new Set<string>();

    document.parsed.tags.forEach((tag) => {
      const key = tag.toLowerCase();

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      const existing = counts.get(key);

      if (existing) {
        existing.count += 1;
        return;
      }

      counts.set(key, { count: 1, tag });
    });
  });

  return Array.from(counts.values()).sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}
