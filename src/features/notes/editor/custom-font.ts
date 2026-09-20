/**
 * Custom font families — encoding, parsing, and CSS sanitization (#1429 alignment).
 *
 * Persisted font settings accept curated font keys or `custom:<family>`.
 * Because custom font family names can arrive from untrusted storage or user input
 * and are interpolated into CSS declarations, this module applies a strict security
 * boundary:
 *   - Max length 64 characters
 *   - Rejects quotes, backslashes, semicolons, brackets, braces, parentheses,
 *     control characters, comments, commas, and format characters.
 *   - Fails safe by returning `null` so callers fall back to the default font stack
 *     rather than emitting an invalid or injected stylesheet rule.
 */

export const CUSTOM_FONT_PREFIX = "custom:";

export const CUSTOM_FONT_MAX_LENGTH = 64;

/**
 * Disallowed characters that could break CSS syntax, inject rules/selectors,
 * or introduce invisible/format ambiguities.
 */
export const CUSTOM_FONT_DISALLOWED =
  /[\p{Cc}\p{Cf}"'`\\;{}()<>,:*/@[\]$&%!?=|^~#]/u;

/**
 * Returns the setting value string for a custom font family.
 */
export function customFontValue(family: string): string {
  return `${CUSTOM_FONT_PREFIX}${family}`;
}

/**
 * Collapses whitespace, checks length and disallowed characters.
 * Returns safe sanitized family string, or null on failure.
 */
export function sanitizeCustomFontFamily(raw: string): string | null {
  if (CUSTOM_FONT_DISALLOWED.test(raw)) {
    return null;
  }
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed || collapsed.length > CUSTOM_FONT_MAX_LENGTH) {
    return null;
  }
  return collapsed;
}

/**
 * Extracts and sanitizes the family name if `value` starts with `custom:`.
 * Returns null if not a custom font setting or if family name is invalid.
 */
export function parseCustomFont(value: string): string | null {
  if (!value.startsWith(CUSTOM_FONT_PREFIX)) {
    return null;
  }
  return sanitizeCustomFontFamily(value.slice(CUSTOM_FONT_PREFIX.length));
}

/**
 * Quotes a sanitized family name for CSS font-family stacks.
 */
export function quoteCustomFamily(family: string): string {
  return `"${family}"`;
}
