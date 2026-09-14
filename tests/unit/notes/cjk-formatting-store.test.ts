import { describe, expect, it } from "vitest";
import { DEFAULT_CJK_FORMATTING_SETTINGS } from "@/features/notes/formatting/cjk-formatting-settings";
import {
  cjkSettingsFromUi,
  cjkUiSelectsFromSettings,
  cjkUiTogglesFromSettings,
} from "@/features/notes/formatting/cjk-formatting-store";

describe("cjk-formatting-store mapping", () => {
  it("maps default canonical settings to UI and back without drift", () => {
    const toggles = cjkUiTogglesFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);
    const selects = cjkUiSelectsFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);

    const roundTripped = cjkSettingsFromUi(toggles, selects);
    expect(roundTripped).toEqual(DEFAULT_CJK_FORMATTING_SETTINGS);
  });

  it("translates UI toggle keys to the canonical rule fields", () => {
    const toggles = cjkUiTogglesFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);
    const selects = cjkUiSelectsFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);

    // 关掉「转换破折号」「移除尾部空格」，应反映到对应规范字段。
    toggles.convertDashes = false;
    toggles.removeTrailingSpaces = false;

    const settings = cjkSettingsFromUi(toggles, selects);
    expect(settings.dashConversion).toBe(false);
    expect(settings.trailingSpaceRemoval).toBe(false);
    // 未改动的字段保持默认。
    expect(settings.cjkEnglishSpacing).toBe(true);
  });

  it("maps the quote-style select index to the canonical quote style", () => {
    const toggles = cjkUiTogglesFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);
    const selects = cjkUiSelectsFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);

    expect(cjkSettingsFromUi(toggles, { ...selects, quoteStyle: 0 }).quoteStyle).toBe("curly");
    expect(cjkSettingsFromUi(toggles, { ...selects, quoteStyle: 1 }).quoteStyle).toBe("corner");
    expect(cjkSettingsFromUi(toggles, { ...selects, quoteStyle: 2 }).quoteStyle).toBe("guillemets");
  });

  it("maps the consecutive-punctuation select index to its limit value", () => {
    const toggles = cjkUiTogglesFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);
    const base = cjkUiSelectsFromSettings(DEFAULT_CJK_FORMATTING_SETTINGS);

    expect(cjkSettingsFromUi(toggles, { ...base, limitConsecutivePunct: 0 }).consecutivePunctuationLimit).toBe(0);
    expect(cjkSettingsFromUi(toggles, { ...base, limitConsecutivePunct: 1 }).consecutivePunctuationLimit).toBe(1);
    expect(cjkSettingsFromUi(toggles, { ...base, limitConsecutivePunct: 2 }).consecutivePunctuationLimit).toBe(3);
  });
});
