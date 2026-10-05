import {
  DEFAULT_CJK_FORMATTING_SETTINGS,
  type CJKFormattingSettings,
  type QuoteStyle,
} from "../cjk-formatting-settings";

/** Per-invocation options for document or segment formatting. */
export interface FormatOptions {
  preserveTwoSpaceHardBreaks?: boolean;
  startsAtLineStart?: boolean;
  endsAtLineEnd?: boolean;
  /** Visible label of the link whose closing parenthesis begins this segment. */
  linkLabel?: string | undefined;
}

export type { CJKFormattingSettings, QuoteStyle };
export const DEFAULT_CJK_FORMATTING = DEFAULT_CJK_FORMATTING_SETTINGS;

/** A span of Markdown that must be excluded from formatting. */
export interface ProtectedRegion {
  start: number;
  end: number;
  type:
    | "fenced_code"
    | "inline_code"
    | "indented_code"
    | "link_url"
    | "image"
    | "frontmatter"
    | "html_tag"
    | "wiki_link"
    | "footnote_ref"
    | "footnote_def"
    | "math_block"
    | "math_inline"
    | "thematic_break"
    | "reference_section"
    | "character_reference";
}

export interface ProtectedRegionOptions {
  skipReferenceSections?: boolean;
}
