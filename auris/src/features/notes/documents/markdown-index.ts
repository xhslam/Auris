import type {
  NoteHeadingIndex,
  NoteTaskIndex,
  ParsedNoteIndex,
} from "@/features/notes/documents/document-types";
import {
  extractMarkdownNoteLinks,
  extractWikiLinks,
} from "@/features/notes/documents/wiki-links";

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const TASK_PATTERN = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const TAG_PATTERN = /(^|\s)#([A-Za-z0-9/_-]+)/g;

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractHeadings(lines: string[]) {
  const headings: NoteHeadingIndex[] = [];

  lines.forEach((line, lineIndex) => {
    const headingMatch = line.match(HEADING_PATTERN);

    if (!headingMatch) {
      return;
    }

    headings.push({
      depth: headingMatch[1].length,
      line: lineIndex,
      slug: slugifyHeading(headingMatch[2]),
      text: headingMatch[2].trim(),
    });
  });

  return headings;
}

function extractTasks(lines: string[]) {
  const tasks: NoteTaskIndex[] = [];

  lines.forEach((line, lineIndex) => {
    const taskMatch = line.match(TASK_PATTERN);

    if (!taskMatch) {
      return;
    }

    tasks.push({
      checked: taskMatch[1].toLowerCase() === "x",
      line: lineIndex,
      text: taskMatch[2].trim(),
    });
  });

  return tasks;
}

function extractTags(lines: string[]) {
  const tags = new Set<string>();

  lines.forEach((line) => {
    const matches = line.matchAll(TAG_PATTERN);

    Array.from(matches).forEach((match) => {
      const tag = match[2]?.trim();

      if (tag) {
        tags.add(tag);
      }
    });
  });

  return Array.from(tags);
}

function countWords(lines: string[]) {
  const normalized = lines
    .filter((line) => !HEADING_PATTERN.test(line))
    .map((line) =>
      line
        .replace(TASK_PATTERN, "$2")
        .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$1")
        .replace(TAG_PATTERN, " $2")
        .replace(/[`>*_[\]-]/g, " "),
    )
    .join(" ")
    .trim();

  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).filter(Boolean).length;
}

export function buildMarkdownIndex(source: string): ParsedNoteIndex {
  const normalizedSource = source.trim();
  const lines = normalizedSource ? normalizedSource.split(/\r?\n/) : [];
  const headings = extractHeadings(lines);
  const title = headings.find((heading) => heading.depth === 1)?.text ?? headings[0]?.text ?? null;

  return {
    backlinks: [],
    embeds: [],
    headings,
    links: [
      ...extractWikiLinks(normalizedSource),
      ...extractMarkdownNoteLinks(normalizedSource),
    ],
    tags: extractTags(lines),
    tasks: extractTasks(lines),
    title,
    wordCount: countWords(lines),
  };
}
