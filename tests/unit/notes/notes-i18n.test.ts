import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EN_US_NOTES_UI_COPY,
} from "@/components/notes-v2/notes-ui-copy.en";
import {
  NOTES_UI_COPY,
  ZH_CN_NOTES_UI_COPY,
} from "@/components/notes-v2/notes-ui-copy";
import {
  loadNotesLocale,
  NOTES_LOCALE_EVENT,
  saveNotesLocale,
} from "@/features/notes/i18n/notes-locale";

function collectShape(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") {
    return [`${prefix}:function`];
  }
  if (Array.isArray(value)) {
    return [`${prefix}:array`];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      collectShape(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [`${prefix}:${typeof value}`];
}

describe("notes i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveNotesLocale("zh-CN");
  });

  it("keeps locale resources structurally identical", () => {
    expect(collectShape(EN_US_NOTES_UI_COPY).sort()).toEqual(
      collectShape(ZH_CN_NOTES_UI_COPY).sort(),
    );
  });

  it("switches the live copy and persists the selected locale", () => {
    const listener = vi.fn();
    window.addEventListener(NOTES_LOCALE_EVENT, listener);

    expect(NOTES_UI_COPY.headerActions.newNote).toBe("新建");
    saveNotesLocale("en-US");

    expect(loadNotesLocale()).toBe("en-US");
    expect(NOTES_UI_COPY.headerActions.newNote).toBe("New");
    expect(NOTES_UI_COPY.panels.tags.filterLabel("grammar")).toBe(
      "Filter by tag grammar",
    );
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTES_LOCALE_EVENT, listener);
  });

  it("falls back safely when persisted locale data is invalid", () => {
    window.localStorage.setItem("auris.notes.locale.v1", "xx-INVALID");
    saveNotesLocale("zh-CN", null);

    expect(loadNotesLocale()).toBe("zh-CN");
  });
});
