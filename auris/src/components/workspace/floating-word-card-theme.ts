/**
 * Copy CSS custom properties from a themed scope element onto a portaled card,
 * so background/border tokens still resolve after leaving the page tree.
 */

export const READING_WORD_CARD_THEME_VARS = [
  "--reading-background",
  "--reading-foreground",
  "--reading-muted",
  "--reading-border",
  "--reading-panel",
  "--reading-panel-foreground",
  "--reading-accent",
  "--reading-accent-soft",
  "--reading-accent-line",
  "--reading-toolbar",
  "--reading-shadow",
] as const;

export const VIDEO_WORD_CARD_THEME_VARS = [
  "--vs-bg",
  "--vs-fg",
  "--vs-muted",
  "--vs-border",
  "--vs-panel",
  "--vs-panel-border",
  "--vs-accent",
  "--vs-hover",
  "--vs-shadow",
] as const;

export function applyThemeVarsFromScope(
  target: HTMLElement,
  scopeSelector: string,
  varNames: readonly string[],
) {
  const scope = document.querySelector(scopeSelector);
  if (!(scope instanceof HTMLElement)) {
    return;
  }

  const computed = getComputedStyle(scope);
  for (const name of varNames) {
    const value = computed.getPropertyValue(name).trim();
    if (value) {
      target.style.setProperty(name, value);
    }
  }
}
