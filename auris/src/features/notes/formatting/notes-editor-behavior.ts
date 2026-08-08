/**
 * 源码编辑器行为设置（自动配对 / Tab 宽度）。
 *
 * 范围说明：这两项只作用于「源码模式」(CodeMirror)。默认的所见即所得编辑器
 * 本身不做括号配对，故不受影响。其余「行为」开关（CJK 括号、弯引号、复制格式、
 * 新标签打开等）暂未接入——CJK 括号配对会与中文输入法冲突，风险高，单独评估。
 *
 * 只持久化真正生效的字段，避免"开关装样子"。
 */

export type NotesEditorTabSize = "2" | "4" | "tab";

export interface NotesEditorBehaviorSettings {
  autoPair: boolean;
  tabSize: NotesEditorTabSize;
  showInvisibles: boolean;
}

/** 默认值——autoPair=true 等于现状（CodeMirror 默认开启括号配对）；不可见字符默认关。 */
export const DEFAULT_NOTES_EDITOR_BEHAVIOR: NotesEditorBehaviorSettings = {
  autoPair: true,
  tabSize: "2",
  showInvisibles: false,
};

const STORAGE_KEY = "auris.notes.editor-behavior";

/** 同窗口内广播变更。 */
export const NOTES_EDITOR_BEHAVIOR_EVENT = "auris:notes-editor-behavior";

export function loadNotesEditorBehavior(): NotesEditorBehaviorSettings {
  if (typeof window === "undefined") {
    return DEFAULT_NOTES_EDITOR_BEHAVIOR;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesEditorBehaviorSettings>;
      return { ...DEFAULT_NOTES_EDITOR_BEHAVIOR, ...parsed };
    }
  } catch {
    // 回退默认。
  }
  return DEFAULT_NOTES_EDITOR_BEHAVIOR;
}

export function saveNotesEditorBehavior(
  settings: NotesEditorBehaviorSettings,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 写入失败不阻塞。
  }
  window.dispatchEvent(
    new CustomEvent<NotesEditorBehaviorSettings>(NOTES_EDITOR_BEHAVIOR_EVENT, {
      detail: settings,
    }),
  );
}

/** Tab 宽度 → CodeMirror 缩进字符串（"2"/"4" 为空格，"tab" 为制表符）。 */
export function editorIndentString(tabSize: NotesEditorTabSize): string {
  if (tabSize === "tab") {
    return "\t";
  }
  return tabSize === "4" ? "    " : "  ";
}

/** Tab 字符的显示宽度。 */
export function editorTabWidth(tabSize: NotesEditorTabSize): number {
  return tabSize === "4" || tabSize === "tab" ? 4 : 2;
}

/* ── 设置页 UI 映射 ───────────────────────────────────────────────────── */

const TAB_SIZES: NotesEditorTabSize[] = ["2", "4", "tab"]; // 对应「2 个空格 / 4 个空格 / Tab」

type UiToggles = Record<string, boolean>;
type UiSelects = Record<string, number>;

export function editorBehaviorFromUi(
  toggles: UiToggles,
  selects: UiSelects,
): NotesEditorBehaviorSettings {
  const idx = selects.tabSize ?? 0;
  return {
    autoPair: toggles.autoPair,
    tabSize: TAB_SIZES[idx] ?? "2",
    showInvisibles: toggles.showInvisibles,
  };
}

export function editorBehaviorUiToggles(
  settings: NotesEditorBehaviorSettings,
): UiToggles {
  return {
    autoPair: settings.autoPair,
    showInvisibles: settings.showInvisibles,
  };
}

export function editorBehaviorUiSelects(
  settings: NotesEditorBehaviorSettings,
): UiSelects {
  return { tabSize: Math.max(0, TAB_SIZES.indexOf(settings.tabSize)) };
}
