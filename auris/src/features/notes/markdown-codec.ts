import {
  createNoteBlock,
  createNotePage,
  createStableNoteIdFromFileName,
  getDefaultNoteIcon,
  sanitizeNoteFileName,
} from "@/features/notes/note-model";
import type { NoteBlock, NotePage } from "@/features/notes/note-types";
import YAML from "yaml";

type ParsedFrontmatter = {
  icon?: string;
  id?: string;
  title?: string;
  updatedAt?: string;
} & Record<string, unknown>;

type ParseMarkdownNoteInput = {
  fileName: string;
  markdown: string;
  relativePath?: string;
};

function parseFrontmatter(source: string) {
  if (!source.startsWith("---\n")) {
    return {
      body: source.trim(),
      frontmatter: {} as ParsedFrontmatter,
    };
  }

  const endIndex = source.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return {
      body: source.trim(),
      frontmatter: {} as ParsedFrontmatter,
    };
  }

  const rawFrontmatter = source.slice(4, endIndex);
  const body = source.slice(endIndex + 5).trim();
  const parsed = YAML.parse(rawFrontmatter);
  const frontmatter: ParsedFrontmatter =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ParsedFrontmatter)
      : {};

  return { body, frontmatter };
}

function renderFrontmatterScalar(value: unknown, options?: { quoteStrings?: boolean }) {
  if (typeof value === "string") {
    if (options?.quoteStrings === false) {
      return value;
    }

    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function renderFrontmatterEntry(key: string, value: unknown) {
  if (Array.isArray(value)) {
    return [
      `${key}:`,
      ...value.map((item) => `  - ${renderFrontmatterScalar(item, { quoteStrings: false })}`),
    ];
  }

  if (value && typeof value === "object") {
    return YAML.stringify({ [key]: value }).trimEnd().split("\n");
  }

  return [
    `${key}: ${renderFrontmatterScalar(value, {
      quoteStrings: key !== "type",
    })}`,
  ];
}

function createCompatBlocks(markdownBody: string) {
  const trimmed = markdownBody.trim();
  const blocks: NoteBlock[] = [];

  if (!trimmed) {
    return [createNoteBlock("paragraph", "")];
  }

  const lines = trimmed.split("\n");
  const paragraphBuffer: string[] = [];

  function flushParagraph() {
    const text = paragraphBuffer.join(" ").trim();

    if (!text) {
      return;
    }

    blocks.push(createNoteBlock("paragraph", text));
    paragraphBuffer.length = 0;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push(createNoteBlock("heading", line.slice(3).trim()));
      continue;
    }

    if (line === "---") {
      flushParagraph();
      blocks.push(createNoteBlock("divider"));
      continue;
    }

    if (line.startsWith("- [ ] ")) {
      flushParagraph();
      blocks.push({
        ...createNoteBlock("todo", line.slice(6).trim()),
        checked: false,
      });
      continue;
    }

    if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
      flushParagraph();
      blocks.push({
        ...createNoteBlock("todo", line.slice(6).trim()),
        checked: true,
      });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      blocks.push(createNoteBlock("bullet", line.slice(2).trim()));
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      blocks.push(createNoteBlock("quote", line.slice(2).trim()));
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return blocks.length > 0 ? blocks : [createNoteBlock("paragraph", "")];
}

function extractTitleFromBody(body: string) {
  return body
    .split("\n")
    .find((line) => line.trim().startsWith("# "))
    ?.trim()
    .slice(2)
    .trim();
}

function stripH1FromBody(body: string, title?: string) {
  const lines = body.split("\n");

  if (!lines[0]?.trim().startsWith("# ")) {
    return body.trim();
  }

  const headingText = lines[0].trim().slice(2).trim();

  if (title && headingText !== title.trim()) {
    return body.trim();
  }

  return lines.slice(1).join("\n").trim();
}

export function serializeMarkdownNote(page: NotePage) {
  const coreKeys = new Set(["icon", "id", "title", "updatedAt"]);
  const additionalFrontmatter = Object.entries(page.frontmatter ?? {})
    .filter(([key]) => !coreKeys.has(key))
    .map(([key, value]) => renderFrontmatterEntry(key, value))
    .flat();
  const metadata = [
    "---",
    ...additionalFrontmatter,
    `id: "${page.id}"`,
    `title: "${page.title.replace(/"/g, '\\"')}"`,
    `icon: "${page.icon.replace(/"/g, '\\"')}"`,
    `updatedAt: "${page.updatedAt}"`,
    "---",
    "",
    `# ${page.title}`,
    "",
  ];

  return [...metadata, page.markdownBody.trim()].join("\n").trimEnd() + "\n";
}

export function parseMarkdownNote({
  fileName,
  markdown,
  relativePath,
}: ParseMarkdownNoteInput): NotePage | null {
  const trimmed = markdown.trim();

  if (!trimmed) {
    return null;
  }

  const { body, frontmatter } = parseFrontmatter(trimmed);
  const fallbackTitle = extractTitleFromBody(body);
  const resolvedTitle = frontmatter.title ?? fallbackTitle ?? fileName.replace(/\.md$/i, "");
  const markdownBody = stripH1FromBody(body, resolvedTitle);

  return createNotePage({
    blocks: createCompatBlocks(markdownBody),
    fileName,
    frontmatter,
    icon: frontmatter.icon ?? getDefaultNoteIcon(),
    id: frontmatter.id ?? createStableNoteIdFromFileName(fileName),
    markdownBody,
    relativePath: relativePath ?? fileName,
    title: resolvedTitle,
    updatedAt: frontmatter.updatedAt,
  });
}

export function createMarkdownFileName(title: string, id: string) {
  const slug = sanitizeNoteFileName(title);
  return `${slug}--${id}.md`;
}
