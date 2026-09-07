/**
 * Repair split surrogate entities for astral characters (e.g. Emoji, CJK Ext-B).
 *
 * Aligned with vmark 2026-09-06 audit finding:
 * `mdast-util-to-markdown` fixes non-flanking delimiters by character-referencing
 * the neighbour by UTF-16 code unit. When that neighbour is an astral character,
 * it encodes only one half of the surrogate pair:
 *
 *     `**word\***🙂word` -> `**word\***&#xD83D;\uDE42word`
 *
 * which reparses as U+FFFD (replacement character) followed by a lone surrogate,
 * corrupting the emoji.
 *
 * The repair re-encodes the surrogate pair into a single valid code-point reference
 * `&#x{CODEPOINT};` so the character decodes cleanly without losing delimiter flanking.
 *
 * @module features/notes/markdown/surrogate-repair
 */

export function repairSplitSurrogateEntities(markdown: string): string {
  if (!markdown || !markdown.includes("&#x")) {
    return markdown;
  }

  /** Calculate the 21-bit code point from UTF-16 surrogate pair */
  const joined = (high: number, low: number): string => {
    const codePoint = ((high - 0xd800) * 0x400) + (low - 0xdc00) + 0x10000;
    return `&#x${codePoint.toString(16).toUpperCase()};`;
  };

  return (
    markdown
      // Encoded HIGH surrogate followed by a raw low surrogate.
      .replace(
        /&#x(D[89ab][0-9a-f]{2});([\uDC00-\uDFFF])/gi,
        (whole, hex: string, low: string) => {
          const high = Number.parseInt(hex, 16);
          if (high < 0xd800 || high > 0xdbff) return whole;
          return joined(high, low.charCodeAt(0));
        },
      )
      // Raw HIGH surrogate followed by an encoded low surrogate.
      .replace(
        /([\uD800-\uDBFF])&#x(D[c-f][0-9a-f]{2});/gi,
        (whole, high: string, hex: string) => {
          const low = Number.parseInt(hex, 16);
          if (low < 0xdc00 || low > 0xdfff) return whole;
          return joined(high.charCodeAt(0), low);
        },
      )
  );
}
