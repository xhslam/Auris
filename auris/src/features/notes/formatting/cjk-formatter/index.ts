/**
 * CJK Text Formatter — Barrel Export
 *
 * Ported into Auris from vmark (https://github.com/xiaolai/vmark),
 * ISC License, Copyright (c) 2026 Xiaolai Li. Adapted: settings/debug/table-parser
 * dependencies were re-pointed to local Auris equivalents; logic is unchanged.
 *
 * Purpose: Provides formatting rules for CJK (Chinese, Japanese, Korean) text in markdown.
 * Handles spacing between CJK and Latin characters, punctuation normalization,
 * quote pairing (fullwidth), and trailing whitespace cleanup.
 *
 * Architecture:
 *   formatter.ts — orchestrates the pipeline (parse → segment → rules → reconstruct)
 *   markdownParser.ts — identifies protected regions (code, URLs, reference sections) to skip
 *   rules.ts — individual formatting rules (spacing, punctuation, etc.)
 *   latinSpanScanner.ts — identifies Latin spans within CJK text
 *   quotePairing.ts — matches and converts quote pairs to fullwidth
 *   integrity.ts — post-format structural integrity verification
 *
 * @coordinates-with settingsStore.ts — CJKFormattingSettings controls which rules are active
 * @coordinates-with menu_events.rs — "format-cjk" menu item triggers formatFile
 * @module lib/cjkFormatter
 */

export { formatMarkdown, formatSelection } from "./formatter";
export { removeTrailingSpaces, collapseNewlines } from "./rules";
export type { IntegrityResult } from "./integrity";
export type { CJKFormattingSettings } from "../cjk-formatting-settings";
