/**
 * Lightweight Markdown parse for the reading exam view.
 * Supports the subset used in exam imports: bold/italic/code, lists, tables,
 * hr, headings, paragraphs, and cloze blanks (`__1__`).
 */

export type ExamMdInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: ExamMdInline[] }
  | { type: "em"; children: ExamMdInline[] }
  | { type: "code"; value: string }
  | { type: "blank"; number: string };

export type ExamMdBlock =
  | { type: "paragraph"; children: ExamMdInline[] }
  | { type: "ul"; items: ExamMdInline[][] }
  | { type: "ol"; items: ExamMdInline[][] }
  | {
      type: "table";
      /** One cell = inline nodes. */
      header: ExamMdInline[][] | null;
      /** One row = cells; one cell = inline nodes. */
      rows: ExamMdInline[][][];
    }
  | { type: "hr" }
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: ExamMdInline[] };

const HR_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_LINE = /^\s*[-*+]\s+(.+)$/;
const OL_LINE = /^\s*(\d+)[.)]\s+(.+)$/;
const HEADING_LINE = /^(#{1,4})\s+(.+)$/;
const TABLE_SEPARATOR_CELL = /^\s*:?-{1,}:?\s*$/;

export function splitTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith("|")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split("|").map((cell) => cell.trim());
}

export function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell));
}

export function isTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return false;
  }
  if (isTableSeparatorLine(trimmed)) {
    return true;
  }
  return splitTableCells(trimmed).length >= 2;
}

function parseTableBlock(tableLines: string[]): ExamMdBlock {
  const sepIndex = tableLines.findIndex((line) => isTableSeparatorLine(line));
  const toCells = (line: string) =>
    splitTableCells(line).map((cell) => parseExamMarkdownInline(cell));

  if (sepIndex === 0) {
    return {
      type: "table",
      header: null,
      rows: tableLines.slice(1).filter((line) => !isTableSeparatorLine(line)).map(toCells),
    };
  }

  if (sepIndex > 0) {
    return {
      type: "table",
      header: toCells(tableLines[sepIndex - 1]!),
      rows: tableLines
        .slice(sepIndex + 1)
        .filter((line) => !isTableSeparatorLine(line))
        .map(toCells),
    };
  }

  return {
    type: "table",
    header: null,
    rows: tableLines.map(toCells),
  };
}

function pushText(nodes: ExamMdInline[], value: string) {
  if (!value) {
    return;
  }
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") {
    last.value += value;
    return;
  }
  nodes.push({ type: "text", value });
}

/**
 * Parse inline markdown: blanks, `code`, **strong**, *em*.
 */
export function parseExamMarkdownInline(text: string): ExamMdInline[] {
  const nodes: ExamMdInline[] = [];
  let index = 0;

  while (index < text.length) {
    const blankMatch = text.slice(index).match(/^__(\d+)__/);
    if (blankMatch) {
      nodes.push({ type: "blank", number: blankMatch[1]! });
      index += blankMatch[0].length;
      continue;
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        nodes.push({ type: "code", value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        nodes.push({
          type: "strong",
          children: parseExamMarkdownInline(text.slice(index + 2, end)),
        });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "*" && text[index + 1] !== "*") {
      const end = text.indexOf("*", index + 1);
      if (end !== -1 && text[end + 1] !== "*") {
        nodes.push({
          type: "em",
          children: parseExamMarkdownInline(text.slice(index + 1, end)),
        });
        index = end + 1;
        continue;
      }
    }

    const nextSpecial = text.slice(index).search(/__\d+__|`|\*\*|\*/);
    if (nextSpecial === -1) {
      pushText(nodes, text.slice(index));
      break;
    }
    if (nextSpecial === 0) {
      // Unmatched marker — treat as literal text and advance one char.
      pushText(nodes, text[index]!);
      index += 1;
      continue;
    }
    pushText(nodes, text.slice(index, index + nextSpecial));
    index += nextSpecial;
  }

  return nodes;
}

function flushParagraph(
  blocks: ExamMdBlock[],
  lines: string[],
) {
  if (lines.length === 0) {
    return;
  }
  blocks.push({
    type: "paragraph",
    children: parseExamMarkdownInline(lines.join("\n")),
  });
  lines.length = 0;
}

/**
 * Parse exam-block markdown into a small block AST for the reading UI.
 */
export function parseExamMarkdown(text: string): ExamMdBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ExamMdBlock[] = [];
  const paragraphLines: string[] = [];
  let ulItems: ExamMdInline[][] | null = null;
  let olItems: ExamMdInline[][] | null = null;

  const flushLists = () => {
    if (ulItems) {
      blocks.push({ type: "ul", items: ulItems });
      ulItems = null;
    }
    if (olItems) {
      blocks.push({ type: "ol", items: olItems });
      olItems = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (!line.trim()) {
      flushLists();
      flushParagraph(blocks, paragraphLines);
      continue;
    }

    if (isTableRowLine(line)) {
      flushLists();
      flushParagraph(blocks, paragraphLines);
      const tableLines = [line];
      while (
        index + 1 < lines.length &&
        isTableRowLine(lines[index + 1]!)
      ) {
        index += 1;
        tableLines.push(lines[index]!);
      }
      blocks.push(parseTableBlock(tableLines));
      continue;
    }

    if (HR_LINE.test(line)) {
      flushLists();
      flushParagraph(blocks, paragraphLines);
      blocks.push({ type: "hr" });
      continue;
    }

    const headingMatch = line.match(HEADING_LINE);
    if (headingMatch) {
      flushLists();
      flushParagraph(blocks, paragraphLines);
      const level = Math.min(4, headingMatch[1]!.length) as 1 | 2 | 3 | 4;
      blocks.push({
        type: "heading",
        level,
        children: parseExamMarkdownInline(headingMatch[2]!.trim()),
      });
      continue;
    }

    const ulMatch = line.match(UL_LINE);
    if (ulMatch) {
      flushParagraph(blocks, paragraphLines);
      if (olItems) {
        blocks.push({ type: "ol", items: olItems });
        olItems = null;
      }
      ulItems ??= [];
      ulItems.push(parseExamMarkdownInline(ulMatch[1]!));
      continue;
    }

    const olMatch = line.match(OL_LINE);
    if (olMatch) {
      flushParagraph(blocks, paragraphLines);
      if (ulItems) {
        blocks.push({ type: "ul", items: ulItems });
        ulItems = null;
      }
      olItems ??= [];
      olItems.push(parseExamMarkdownInline(olMatch[2]!));
      continue;
    }

    flushLists();
    paragraphLines.push(line);
  }

  flushLists();
  flushParagraph(blocks, paragraphLines);
  return blocks;
}
