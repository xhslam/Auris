import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import type { Plugin } from "unified";
import { remarkInlineFastPaths } from "./fast-paths/remark-inline-fast-paths";
import { assertNotesMarkdownNestingSafe } from "./notes-markdown-nesting";

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

function displayBlockContext(before: string) {
  const quotePrefix = /^( {0,3}(?:>[ \t]?)+)/u.exec(before)?.[1] ?? "";
  const listPrefix = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/u.exec(
    before.slice(quotePrefix.length),
  )?.[0] ?? "";
  const continuation = `${quotePrefix}${" ".repeat(listPrefix.length)}`;

  return {
    continuation,
    separator: `\n${quotePrefix.trimEnd()}\n${continuation}`,
  };
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
      (index > 0 && markdown[index - 1] === "\\")
    ) {
      continue;
    }

    let openerIndex = index;
    while (markdown[openerIndex] === "\\") openerIndex += 1;
    const delimiterWidth = openerIndex - index;

    // NotebookLM can copy delimiters with two backslashes; an earlier rich
    // editor save can then escape both the backslashes and bracket, leaving
    // three. Accept only balanced runs of one to three, while leaving longer
    // runs and TeX line breaks alone.
    if (delimiterWidth > 3) continue;

    const opener = markdown[openerIndex];
    const kind: MathDelimiterKind | null =
      opener === "(" ? "inline" : opener === "[" ? "display" : null;
    if (!kind || mask[openerIndex]) continue;

    const closer = kind === "inline" ? ")" : "]";
    let close = -1;
    let cursor = openerIndex + 1;

    while (cursor < markdown.length) {
      if (markdown[cursor] !== "\\") {
        cursor += 1;
        continue;
      }

      const closeStart = cursor;
      while (markdown[cursor] === "\\") cursor += 1;
      const closeWidth = cursor - closeStart;

      if (
        closeWidth === delimiterWidth &&
        markdown[cursor] === closer &&
        !mask[closeStart] &&
        !mask[cursor]
      ) {
        close = closeStart;
        break;
      }
    }

    if (close < 0) continue;
    const end = close + delimiterWidth + 1;
    const rawContent = markdown.slice(openerIndex + 1, close);
    const content = sanitizeMathContent(rawContent);

    if (
      !content ||
      containsBlankLine(rawContent) ||
      mask.slice(index, end).some(Boolean)
    ) {
      continue;
    }

    if (kind === "inline" && rawContent.includes("\n")) {
      continue;
    }

    if (kind === "display") {
      const before = markdown.slice(lineStartAt(markdown, index), index);
      const after = markdown.slice(end, lineEndAt(markdown, end));
      const sharesLineWithProse = before.trim() || after.trim();

      // A paired escaped bracket around an ordinary word is often literal
      // Markdown text. Retain that spelling unless it contains math syntax.
      if (
        sharesLineWithProse &&
        content.length > 1 &&
        /^[\p{Letter}][\p{Letter}\p{Number}\s-]*$/u.test(content)
      ) {
        continue;
      }
    }

    spans.push({ content, end, kind, start: index });
    index = end - 1;
  }

  return spans;
}

/**
 * Clean up common NotebookLM / AI export math quirks:
 * 1. Double backslashes on LaTeX macros/delimiters: \\frac -> \frac, \\gamma -> \gamma, etc.
 * 2. Double-escaped line-breaks in arrays/matrices: \\\\ -> \\
 * 3. Markdown-escaped brackets inside math: \[ -> [, \] -> ] (preserving \left[ and \right])
 * 4. Subscripts with markdown-escaped underscore: \_{...} -> _{...}
 * 5. Unescaped percent signs in math: % -> \% (avoids LaTeX comment swallowing remainder)
 */
export function sanitizeMathContent(content: string): string {
  let cleaned = content.trim();

  // 1. Unescape double backslashes before LaTeX macro names, symbols or delimiters:
  // e.g. \\gamma -> \gamma, \\frac -> \frac, \\{ -> \{, \\} -> \}, \\| -> \|, \\approx -> \approx
  cleaned = cleaned.replace(/\\\\([a-zA-Z]+|\{|\}|\||,|:|;|!)/gu, "\\$1");

  // 2. Double-escaped line-breaks in arrays/matrices: \\\\ followed by space/newline -> \\
  cleaned = cleaned.replace(/\\\\(?:\s|$)/gu, "\\\\ ");

  // 3. Unescape Markdown-escaped brackets inside math: \[ -> [, \] -> ]
  // Preserving \left[ and \right], \bigl[, \bigr], etc.
  cleaned = cleaned.replace(
    /(?<!\\(?:left|right|bigl|Bigl|biggl|Biggl|bigr|Bigr|biggr|Biggr))\s*\\\[/gu,
    "[",
  );
  cleaned = cleaned.replace(
    /(?<!\\(?:left|right|bigl|Bigl|biggl|Biggl|bigr|Bigr|biggr|Biggr))\s*\\\]/gu,
    "]",
  );

  // 4. Subscripts with markdown-escaped underscore: \_{...} -> _{...}
  cleaned = cleaned.replace(/\\_\{/gu, "_{");

  // 5. Unescaped percent signs in math: % -> \%
  cleaned = cleaned.replace(/(?<!\\)%/gu, "\\%");

  return cleaned;
}

/** Convert compatible one- to three-backslash AI delimiters to canonical `$` math. */
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
      const before = markdown.slice(lineStartAt(markdown, span.start), span.start);
      const after = markdown.slice(span.end, lineEndAt(markdown, span.end));
      const { continuation, separator } = displayBlockContext(before);
      // remark-math only makes a block node when its fence is on a separate
      // line. AI exports may place \[...\] directly after the prose that
      // introduces it. Keep continuation indentation for lists and quotes.
      result.push(
        `${before.trim() ? separator : ""}${fence}\n${continuation}${span.content.replaceAll("\n", `\n${continuation}`)}\n${continuation}${fence}${after.trim() ? separator : ""}`,
      );
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
        if (
          (child.type === "inlineMath" || child.type === "math") &&
          typeof child.value === "string"
        ) {
          child.value = sanitizeMathContent(child.value);
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
    .use(remarkInlineFastPaths)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkValidateNotesMath);
}

export function parseNotesMarkdownAst(markdown: string) {
  assertNotesMarkdownNestingSafe(markdown);
  const processor = createNotesMarkdownProcessor();
  const source = normalizeNotesMathDelimiters(markdown);
  return processor.runSync(processor.parse(source));
}
