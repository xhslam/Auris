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

export type SearchableDocument = {
  bodyLower: string;
  headingsLower: string[];
  pathLower: string;
  tagsLower: string[];
  tagSetLower: Set<string>;
  titleLower: string;
};

const searchableCache = new WeakMap<NoteDocument, SearchableDocument>();

export function getSearchableDocument(document: NoteDocument): SearchableDocument {
  let cached = searchableCache.get(document);
  if (!cached) {
    const tagsLower = document.parsed.tags.map((tag) => tag.toLowerCase());
    cached = {
      bodyLower: document.rawSource.toLowerCase(),
      headingsLower: document.parsed.headings.map((heading) => heading.text.toLowerCase()),
      pathLower: document.path.toLowerCase(),
      tagsLower,
      tagSetLower: new Set(tagsLower),
      titleLower: (document.parsed.title ?? "").toLowerCase(),
    };
    searchableCache.set(document, cached);
  }
  return cached;
}

function matchesTagFilters(searchable: SearchableDocument, tagFilters: string[]) {
  if (tagFilters.length === 0) {
    return true;
  }

  return tagFilters.every((filter) => searchable.tagSetLower.has(filter));
}

function matchesTextTerm(searchable: SearchableDocument, term: string) {
  return (
    searchable.pathLower.includes(term) ||
    searchable.titleLower.includes(term) ||
    searchable.bodyLower.includes(term) ||
    searchable.tagsLower.some((tag) => tag.includes(term)) ||
    searchable.headingsLower.some((heading) => heading.includes(term))
  );
}

function matchesDocument(searchable: SearchableDocument, parsed: ParsedSearchQuery) {
  if (!matchesTagFilters(searchable, parsed.tagFilters)) {
    return false;
  }

  return parsed.textTerms.every((term) => matchesTextTerm(searchable, term));
}

function scoreDocument(searchable: SearchableDocument, parsed: ParsedSearchQuery) {
  let score = parsed.tagFilters.length * 3;
  const title = searchable.titleLower;
  const path = searchable.pathLower;
  const body = searchable.bodyLower;

  parsed.textTerms.forEach((term) => {
    if (title.includes(term)) {
      score += 4;
    }

    if (searchable.headingsLower.some((heading) => heading.includes(term))) {
      score += 2;
    }

    if (searchable.tagsLower.some((tag) => tag.includes(term))) {
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

  const matches: Array<{ document: NoteDocument; index: number; score: number }> = [];

  for (let index = 0; index < documents.length; index++) {
    const document = documents[index];
    const searchable = getSearchableDocument(document);

    if (matchesDocument(searchable, parsed)) {
      matches.push({
        document,
        index,
        score: scoreDocument(searchable, parsed),
      });
    }
  }

  return matches
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
