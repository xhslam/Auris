/** Bound recursive container parsing before handing untrusted Markdown to remark. */
export const MAX_NOTES_MARKDOWN_CONTAINER_DEPTH = 1000;

const FENCE_START = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const LIST_MARKER = /(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/yu;

export class NotesMarkdownNestingError extends Error {
  constructor(
    readonly depth: number,
    readonly limit: number,
  ) {
    super(`Markdown 容器嵌套深度 ${depth} 超过安全上限 ${limit}。请在源码模式调整列表或引用嵌套。`);
    this.name = "NotesMarkdownNestingError";
  }
}

function thematicBreakStart(line: string): number {
  let index = line.length - 1;
  while (index >= 0 && (line[index] === " " || line[index] === "\t")) index -= 1;
  const marker = line[index];
  if (marker !== "-" && marker !== "*" && marker !== "_") return line.length;

  let count = 0;
  let start = index;
  for (; index >= 0; index -= 1) {
    if (line[index] === marker) {
      count += 1;
      start = index;
    } else if (line[index] !== " " && line[index] !== "\t") {
      break;
    }
  }
  return count >= 3 ? start : line.length;
}

/** Count leading quote and list containers, including `- - - item` on one line. */
export function maxNotesMarkdownContainerDepth(markdown: string): number {
  let maximum = 0;
  let fence: { character: string; width: number } | null = null;

  for (const line of markdown.split("\n")) {
    let index = 0;
    let depth = 0;
    let spaces = 0;
    const ruleStart = thematicBreakStart(line);
    while (index < line.length) {
      const character = line[index];
      if (character === " " || character === "\t") {
        spaces += character === "\t" ? 4 : 1;
        index += 1;
      } else if (character === ">") {
        depth += Math.floor(spaces / 2) + 1;
        spaces = 0;
        index += 1;
      } else {
        if (index >= ruleStart) break;
        LIST_MARKER.lastIndex = index;
        const marker = LIST_MARKER.exec(line);
        if (!marker) break;
        depth += Math.floor(spaces / 2) + 1;
        spaces = 0;
        index = LIST_MARKER.lastIndex;
        while (line[index] === " " || line[index] === "\t") index += 1;
      }
    }

    // Fences can start inside a list or quote container, not only at column 0.
    const fenceMatch = FENCE_START.exec(line.slice(index));
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.width &&
        /^[ \t]*\r?$/u.test(fenceMatch[2])
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch && !(fenceMatch[1][0] === "`" && fenceMatch[2].includes("`"))) {
      fence = { character: fenceMatch[1][0], width: fenceMatch[1].length };
      continue;
    }
    maximum = Math.max(maximum, depth);
  }
  return maximum;
}

export function assertNotesMarkdownNestingSafe(markdown: string): void {
  const depth = maxNotesMarkdownContainerDepth(markdown);
  if (depth > MAX_NOTES_MARKDOWN_CONTAINER_DEPTH) {
    throw new NotesMarkdownNestingError(depth, MAX_NOTES_MARKDOWN_CONTAINER_DEPTH);
  }
}
