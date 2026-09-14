export type MarkdownPreviewKind =
  | "blank"
  | "heading"
  | "ordered-list"
  | "paragraph"
  | "quote"
  | "task"
  | "unordered-list";

export type MarkdownPreviewLine = {
  checked?: boolean;
  content: string;
  key: string;
  kind: MarkdownPreviewKind;
  level?: number;
  marker?: string;
};

function createLine(
  key: string,
  kind: MarkdownPreviewKind,
  content: string,
  options?: Pick<MarkdownPreviewLine, "checked" | "level" | "marker">,
): MarkdownPreviewLine {
  return {
    checked: options?.checked,
    content,
    key,
    kind,
    level: options?.level,
    marker: options?.marker,
  };
}

export function parseMarkdownPreview(markdownBody: string): MarkdownPreviewLine[] {
  return markdownBody.split(/\r?\n/).map((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      return createLine(`blank-${index}`, "blank", "");
    }

    const taskMatch = line.match(/^(\s*[-*+]\s+\[(?: |x|X)\])\s+(.*)$/);

    if (taskMatch) {
      return createLine(`task-${index}`, "task", taskMatch[2], {
        checked: /\[[xX]\]/.test(taskMatch[1]),
        marker: taskMatch[1],
      });
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      return createLine(`heading-${index}`, "heading", headingMatch[2], {
        level: headingMatch[1].length,
        marker: headingMatch[1],
      });
    }

    const quoteMatch = line.match(/^(>+)\s?(.*)$/);

    if (quoteMatch) {
      return createLine(`quote-${index}`, "quote", quoteMatch[2], {
        level: quoteMatch[1].length,
        marker: quoteMatch[1],
      });
    }

    const orderedMatch = line.match(/^(\d+\.)\s+(.*)$/);

    if (orderedMatch) {
      return createLine(`ordered-${index}`, "ordered-list", orderedMatch[2], {
        marker: orderedMatch[1],
      });
    }

    const unorderedMatch = line.match(/^([-*+])\s+(.*)$/);

    if (unorderedMatch) {
      return createLine(`unordered-${index}`, "unordered-list", unorderedMatch[2], {
        marker: unorderedMatch[1],
      });
    }

    return createLine(`paragraph-${index}`, "paragraph", line);
  });
}
