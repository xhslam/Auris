import type { Element, ElementContent, Root, RootContent } from "hast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

export const PERSONAL_VOCAB_SECTION_CONTRACTS = {
  context: ["当前语境"],
  etymology: ["词源", "构词", "核心语义", "原始画面", "核心意象"],
  usage: ["用法", "边界", "搭配", "近义词", "误用"],
  deep: ["深层", "解释"],
  epiphany: ["一语道破", "金句"],
} as const;

export type PersonalVocabSectionKey =
  keyof typeof PERSONAL_VOCAB_SECTION_CONTRACTS;

export type PersonalVocabMarkdownGroup = {
  id: string;
  lines: readonly string[];
};

type PersonalVocabSourceSection = {
  lines: readonly string[];
  title: string;
};

export function selectPersonalVocabMarkdownGroups(
  sections: readonly PersonalVocabSourceSection[],
  sectionKey: PersonalVocabSectionKey,
): PersonalVocabMarkdownGroup[] {
  const matchers = PERSONAL_VOCAB_SECTION_CONTRACTS[sectionKey];

  return sections.flatMap((section, index) => {
    const normalizedTitle = section.title.trim().toLowerCase();
    const matches = matchers.some((matcher) =>
      normalizedTitle.includes(matcher.toLowerCase()),
    );

    return matches
      ? [{ id: `${sectionKey}-${index}`, lines: section.lines }]
      : [];
  });
}

export function selectPersonalVocabContextGroups(
  sections: readonly PersonalVocabSourceSection[],
  fallbackContext?: string,
): PersonalVocabMarkdownGroup[] {
  const savedGroups = selectPersonalVocabMarkdownGroups(sections, "context");
  if (savedGroups.length > 0) {
    return savedGroups;
  }

  const trimmedFallback = fallbackContext?.trim() ?? "";
  return trimmedFallback
    ? [{ id: "context-fallback", lines: [trimmedFallback] }]
    : [];
}

type LineKind = "unordered" | "ordered" | "quote" | "ordinary";

function getLineKind(line: string): LineKind {
  if (/^ {0,3}[-+*]\s+/.test(line)) return "unordered";
  if (/^ {0,3}\d{1,9}[.)]\s+/.test(line)) return "ordered";
  if (/^ {0,3}>/.test(line)) return "quote";
  return "ordinary";
}

function getFence(line: string) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  if (match[1][0] === "`" && match[2].includes("`")) return null;
  return { character: match[1][0], length: match[1].length };
}

function closesFence(
  line: string,
  fence: { character: string; length: number },
) {
  const run = fence.character.repeat(fence.length);
  return new RegExp(`^ {0,3}${run}${fence.character}*\\s*$`).test(line);
}

function isPipeRow(line: string) {
  return line.includes("|") && line.replace(/\|/g, "").trim().length > 0;
}

function getTableColumnCount(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  let count = 1;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== "|") continue;
    let backslashes = 0;
    for (let before = index - 1; before >= 0 && trimmed[before] === "\\"; before -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) count += 1;
  }
  return count;
}

function isTableDelimiter(line: string) {
  if (!isPipeRow(line)) return false;
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = trimmed.split("|");
  return (
    cells.length > 0 &&
    cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
  );
}

export function groupPersonalVocabMarkdownLines(lines: readonly string[]) {
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const fence = getFence(line);
    if (fence) {
      const block = [line];
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        block.push(next);
        index += 1;
        if (closesFence(next, fence)) break;
      }
      blocks.push(block.join("\n"));
      continue;
    }

    if (
      isPipeRow(line) &&
      index + 1 < lines.length &&
      isTableDelimiter(lines[index + 1]) &&
      getTableColumnCount(line) === getTableColumnCount(lines[index + 1])
    ) {
      const block = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && isPipeRow(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      blocks.push(block.join("\n"));
      continue;
    }

    const kind = getLineKind(line);
    if (kind === "ordinary") {
      blocks.push(line);
      index += 1;
      continue;
    }

    const block = [line];
    index += 1;
    while (index < lines.length && getLineKind(lines[index]) === kind) {
      block.push(lines[index]);
      index += 1;
    }
    blocks.push(block.join("\n"));
  }

  return blocks.join("\n\n");
}

const VOCAB_SCHEMA: SanitizeSchema = {
  tagNames: [
    "p",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "del",
    "a",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "br",
    "input",
  ],
  attributes: {
    a: ["href", "title"],
    th: ["align"],
    td: ["align"],
    input: [["type", "checkbox"], "checked", "disabled"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
  },
};

function removeUnsafeInputs() {
  function isUnsafeInput(element: Element) {
    return (
      element.tagName === "input" &&
      (element.properties.type !== "checkbox" ||
        element.properties.disabled !== true)
    );
  }

  function filterElementChildren(children: ElementContent[]): ElementContent[] {
    const filtered: ElementContent[] = [];
    for (const child of children) {
      if (child.type === "element") {
        if (isUnsafeInput(child)) continue;
        child.children = filterElementChildren(child.children);
      }
      filtered.push(child);
    }
    return filtered;
  }

  function filterRootChildren(children: RootContent[]): RootContent[] {
    const filtered: RootContent[] = [];
    for (const child of children) {
      if (child.type === "element") {
        if (isUnsafeInput(child)) continue;
        child.children = filterElementChildren(child.children);
      }
      filtered.push(child);
    }
    return filtered;
  }

  return (tree: Root) => {
    tree.children = filterRootChildren(tree.children);
  };
}

const personalVocabMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, VOCAB_SCHEMA)
  .use(removeUnsafeInputs)
  .use(rehypeStringify)
  .freeze();

export function renderPersonalVocabMarkdown(lines: readonly string[]) {
  return String(
    personalVocabMarkdownProcessor.processSync(
      groupPersonalVocabMarkdownLines(lines),
    ),
  );
}
