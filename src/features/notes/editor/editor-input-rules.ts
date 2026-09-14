const CALLOUT_PATTERN = /^(\s*)>\s*\[!([^\]]+)\]\s*(.*)$/;
const TASK_PATTERN = /^(\s*)([-*+])\s+\[([ xX])\]\s*(.*)$/;
const UNORDERED_LIST_PATTERN = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_LIST_PATTERN = /^(\s*)(\d+)([.)])\s+(.*)$/;
const QUOTE_PATTERN = /^(\s*)>\s?(.*)$/;

function isEmptyContent(value: string) {
  return value.trim().length === 0;
}

export function getMarkdownContinuation(lineText: string): string | null {
  const calloutMatch = lineText.match(CALLOUT_PATTERN);

  if (calloutMatch) {
    return `\n${calloutMatch[1]}> `;
  }

  const taskMatch = lineText.match(TASK_PATTERN);

  if (taskMatch) {
    return isEmptyContent(taskMatch[4])
      ? "\n"
      : `\n${taskMatch[1]}${taskMatch[2]} [ ] `;
  }

  const unorderedListMatch = lineText.match(UNORDERED_LIST_PATTERN);

  if (unorderedListMatch) {
    return isEmptyContent(unorderedListMatch[3])
      ? "\n"
      : `\n${unorderedListMatch[1]}${unorderedListMatch[2]} `;
  }

  const orderedListMatch = lineText.match(ORDERED_LIST_PATTERN);

  if (orderedListMatch) {
    return isEmptyContent(orderedListMatch[4])
      ? "\n"
      : `\n${orderedListMatch[1]}${Number(orderedListMatch[2]) + 1}${orderedListMatch[3]} `;
  }

  const quoteMatch = lineText.match(QUOTE_PATTERN);

  if (quoteMatch) {
    return isEmptyContent(quoteMatch[2]) ? "\n" : `\n${quoteMatch[1]}> `;
  }

  return null;
}
