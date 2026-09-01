import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import type { Plugin } from "unified";

type MathDelimiterKind = "display" | "inline";

export type MathDelimiterSpan = {
  content: string;
  end: number;
  kind: MathDelimiterKind;
  start: number;
};

const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const URL = /\b(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>]+/giu;

function markRange(mask: Uint8Array, start: number, end: number) {
  mask.fill(1, Math.max(0, start), Math.min(mask.length, end));
}

function buildOpaqueMask(markdown: string) {
  const mask = new Uint8Array(markdown.length);
  let fence: { character: string; size: number } | null = null;
  let lineStart = 0;

  while (lineStart <= markdown.length) {
    const newline = markdown.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? markdown.length : newline;
    const line = markdown.slice(lineStart, lineEnd);
    const fenceMatch = CODE_FENCE.exec(line);
    const indentedCode = !fence && /^(?: {4}|\t)/u.test(line);

    if (fence) {
      markRange(mask, lineStart, newline < 0 ? lineEnd : lineEnd + 1);
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.size &&
        /^[ \t]*\r?$/u.test(line.slice(fenceMatch[0].length))
      ) {
        fence = null;
      }
    } else if (fenceMatch) {
      const info = line.slice(fenceMatch[0].length);
      const invalidBacktickFence =
        fenceMatch[1][0] === "`" && info.includes("`");

      if (!invalidBacktickFence) {
        fence = {
          character: fenceMatch[1][0],
          size: fenceMatch[1].length,
        };
        markRange(mask, lineStart, newline < 0 ? lineEnd : lineEnd + 1);
      }
    } else if (indentedCode) {
      markRange(mask, lineStart, newline < 0 ? lineEnd : lineEnd + 1);
    }

    if (newline < 0) break;
    lineStart = newline + 1;
  }

  // Inline code spans are opaque even when they contain math-looking text.
  for (let index = 0; index < markdown.length; index += 1) {
    if (mask[index] || markdown[index] !== "`") continue;

    let runEnd = index + 1;
    while (markdown[runEnd] === "`") runEnd += 1;
    const run = markdown.slice(index, runEnd);
    const close = markdown.indexOf(run, runEnd);

    if (close >= 0) {
      markRange(mask, index, close + run.length);
      index = close + run.length - 1;
    } else {
      index = runEnd - 1;
    }
  }

  // Literal URLs and Markdown link destinations are not prose math contexts.
  for (const match of markdown.matchAll(URL)) {
    markRange(mask, match.index, match.index + match[0].length);
  }

  for (let index = 0; index < markdown.length - 1; index += 1) {
    if (mask[index] || markdown[index] !== "]" || markdown[index + 1] !== "(") {
      continue;
    }

    let cursor = index + 2;
    let depth = 1;
    while (cursor < markdown.length && depth > 0 && markdown[cursor] !== "\n") {
      if (markdown[cursor] === "(" && !isEscaped(markdown, cursor)) depth += 1;
      if (markdown[cursor] === ")" && !isEscaped(markdown, cursor)) depth -= 1;
      cursor += 1;
    }

    if (depth === 0) markRange(mask, index + 2, cursor - 1);
  }

  return mask;
}

function isEscaped(text: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function lineStartAt(text: string, index: number) {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAt(text: string, index: number) {
  const newline = text.indexOf("\n", index);
  return newline < 0 ? text.length : newline;
}

function containsBlankLine(value: string) {
  return /\n[ \t]*\r?\n/u.test(value);
}

function longestDollarRun(value: string) {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    current = character === "$" ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function longestDollarOnlyLine(value: string) {
  return value.split("\n").reduce((longest, line) => {
    const match = /^ {0,3}(\$+)[ \t]*\r?$/u.exec(line);
    return Math.max(longest, match?.[1].length ?? 0);
  }, 0);
}

/**
 * Locate AI-compatible LaTeX delimiters without allowing Markdown code or URL
 * regions to participate. Delimiters are the only bytes rewritten; the LaTeX
 * payload is copied verbatim.
 */
export function findCompatibleMathDelimiterSpans(
  markdown: string,
): MathDelimiterSpan[] {
  if (!markdown.includes("\\(") && !markdown.includes("\\[")) return [];

  const mask = buildOpaqueMask(markdown);
  const spans: MathDelimiterSpan[] = [];

  for (let index = 0; index < markdown.length - 1; index += 1) {
    if (
      mask[index] ||
      markdown[index] !== "\\" ||
      isEscaped(markdown, index)
    ) {
      continue;
    }

    const opener = markdown[index + 1];
    const kind: MathDelimiterKind | null =
      opener === "(" ? "inline" : opener === "[" ? "display" : null;
    if (!kind || mask[index + 1]) continue;

    const closer = kind === "inline" ? "\\)" : "\\]";
    let close = markdown.indexOf(closer, index + 2);

    while (
      close >= 0 &&
      (mask[close] || mask[close + 1] || isEscaped(markdown, close))
    ) {
      close = markdown.indexOf(closer, close + 2);
    }

    if (close < 0) continue;
    const end = close + 2;
    const rawContent = markdown.slice(index + 2, close);
    const content = rawContent.trim();

    if (
      !content ||
      containsBlankLine(rawContent) ||
      mask.slice(index, end).some(Boolean)
    ) {
      continue;
    }

    if (kind === "display") {
      const before = markdown.slice(lineStartAt(markdown, index), index);
      const after = markdown.slice(end, lineEndAt(markdown, end));
      if (!/^[ \t]*$/u.test(before) || !/^[ \t]*\r?$/u.test(after)) continue;
    } else if (rawContent.includes("\n")) {
      continue;
    }

    spans.push({ content, end, kind, start: index });
    index = end - 1;
  }

  return spans;
}

/** Convert compatible `\\(...\\)` / `\\[...\\]` input to canonical `$` math. */
export function normalizeNotesMathDelimiters(markdown: string) {
  const spans = findCompatibleMathDelimiterSpans(markdown);
  if (spans.length === 0) return markdown;

  const result: string[] = [];
  let cursor = 0;

  for (const span of spans) {
    result.push(markdown.slice(cursor, span.start));
    if (span.kind === "display") {
      const fence = "$".repeat(
        Math.max(2, longestDollarOnlyLine(span.content) + 1),
      );
      result.push(`${fence}\n${span.content}\n${fence}`);
    } else {
      const fence = "$".repeat(Math.max(1, longestDollarRun(span.content) + 1));
      result.push(`${fence}${span.content}${fence}`);
    }
    cursor = span.end;
  }

  result.push(markdown.slice(cursor));
  return result.join("");
}

type MdastNode = {
  children?: MdastNode[];
  type: string;
  value?: string;
};

/** Avoid remark-math's `$100 and $200` currency false positive. */
const remarkValidateNotesMath: Plugin = function () {
  return (tree) => {
    const stack = [tree as MdastNode];
    while (stack.length > 0) {
      const parent = stack.pop();
      if (!parent?.children) continue;

      parent.children = parent.children.map((child) => {
        if (
          child.type === "inlineMath" &&
          typeof child.value === "string" &&
          (/^\s/u.test(child.value) || /\s$/u.test(child.value))
        ) {
          return { type: "text", value: `$${child.value}$` };
        }
        if (child.children) stack.push(child);
        return child;
      });
    }
  };
};

/** One Notes Markdown dialect shared by editor import and reading rendering. */
export function createNotesMarkdownProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkValidateNotesMath);
}

export function parseNotesMarkdownAst(markdown: string) {
  const processor = createNotesMarkdownProcessor();
  const source = normalizeNotesMathDelimiters(markdown);
  return processor.runSync(processor.parse(source));
}
