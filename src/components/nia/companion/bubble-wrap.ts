const MAX_LINES = 5;
const NO_START = new Set(["，", "。", "！", "？", "：", "；", "”", "’", "）", "】", "》", "、", ",", ".", "!", "?", ":", ";", ")", "]", "}"]);
const _NO_END = new Set(["“", "‘", "（", "【", "《", "(", "[", "{"]);
const BREAK_AFTER = new Set(["，", "。", "！", "？", "：", "；", "、", ",", ".", "!", "?", ":", ";"]);

const DENSE_PATTERN = /\p{Script_Extensions=Han}|\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}|\p{Script_Extensions=Hangul}/u;

export function isDense(char: string): boolean {
  return DENSE_PATTERN.test(char);
}

export type WrappedBubble = {
  raw: string;
  lines: string[];
};

export function wrap(text: string, maxCols = 22): WrappedBubble {
  if (!text) {
    return { raw: "", lines: [] };
  }

  const segmenter =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;

  const graphemes = segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);

  const lines: string[] = [];
  let current = "";
  let currentCols = 0;

  for (let i = 0; i < graphemes.length; i++) {
    const g = graphemes[i];
    const width = isDense(g) ? 2 : 1;

    // Check line wrap condition
    if (currentCols + width > maxCols && current.length > 0) {
      // Avoid starting a line with NO_START punctuation
      if (NO_START.has(g)) {
        current += g;
        lines.push(current);
        current = "";
        currentCols = 0;
        continue;
      }

      lines.push(current);
      current = g;
      currentCols = width;

      if (lines.length === MAX_LINES - 1) {
        // Collect remaining graphemes into the last line
        const rest = graphemes.slice(i + 1).join("");
        current += rest;
        lines.push(current);
        current = "";
        break;
      }
      continue;
    }

    current += g;
    currentCols += width;

    // If explicit sentence break punctuation is met and line is fairly filled, break cleanly
    if (BREAK_AFTER.has(g) && currentCols >= maxCols * 0.75) {
      lines.push(current);
      current = "";
      currentCols = 0;
      if (lines.length >= MAX_LINES) break;
    }
  }

  if (current.length > 0 && lines.length < MAX_LINES) {
    lines.push(current);
  }

  return {
    raw: text,
    lines: lines.slice(0, MAX_LINES),
  };
}
