// Source: VMark src/lib/cjkFormatter/index.ts
// Commit: 2d3903cb2887a7c6a7a8df7b814f14b745bc2415; ISC (docs/vmark-port/UPSTREAM-LICENSE.txt).
/**
 * CJK Text Formatter — Barrel Export
 *
 * Purpose: Provides formatting rules for CJK (Chinese, Japanese, Korean) text in markdown.
 * Handles spacing between CJK and Latin characters, punctuation normalization,
 * quote pairing (fullwidth), and trailing whitespace cleanup.
 *
 * Architecture:
 *   formatter.ts — orchestrates the pipeline (parse → segment → rules → reconstruct).
 *     `formatMarkdown` is the ONLY entry point: a selection is a document slice,
 *     so it gets the same protection a whole file does.
 *   markdownParser.ts — identifies protected regions (code, URLs, reference sections) to skip
 *   segments.ts — extracts formattable segments and reconstructs text around protected regions
 *   rules.ts — individual formatting rules (spacing, punctuation, etc.)
 *   latinSpanScanner.ts — identifies Latin spans within CJK text
 *   quotePairing.ts — matches and converts quote pairs to fullwidth
 *   integrity.ts — post-format structural integrity verification
 *
 * @coordinates-with settingsStore.ts — CJKFormattingSettings controls which rules are active
 * @coordinates-with src-tauri/src/menu/events.rs — "format-cjk" menu item triggers formatMarkdown
 * @module lib/cjkFormatter
 */

// Preserve the existing Auris public API; both aliases use the protected path.
export { formatFile, formatSelection, formatMarkdown, formatMarkdownChecked } from "./formatter";
export { removeTrailingSpaces, collapseNewlines } from "./rules";
