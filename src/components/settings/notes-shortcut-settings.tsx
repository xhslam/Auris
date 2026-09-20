"use client";

import { useMemo, useRef, useState } from "react";
import {
  NOTES_SHORTCUT_BINDINGS,
  createDefaultNotesShortcutRegistry,
} from "@/features/notes/commands/notes-command-catalog";
import {
  getNotesShortcutBindingId,
  loadNotesShortcutOverrides,
  parseNotesShortcutSettings,
  saveNotesShortcutOverrides,
  serializeNotesShortcutSettings,
  validateNotesShortcut,
  type NotesShortcutOverrides,
} from "@/features/notes/commands/notes-shortcut-settings";

const CUSTOMIZABLE_BINDINGS = NOTES_SHORTCUT_BINDINGS.filter(
  (binding) =>
    binding.surface === "global" &&
    [
      "notes.niaPicker",
      "notes.palette",
      "notes.save",
      "notes.saveAll",
      "notes.split",
      "notes.terminal",
      "notes.focusTerminalOrEditor",
    ].includes(binding.commandId),
);

const LABELS: Record<string, string> = {
  "notes.focusTerminalOrEditor": "聚焦终端或编辑器",
  "notes.niaPicker": "打开 Nia 动作选择器",
  "notes.palette": "打开命令面板",
  "notes.save": "保存当前笔记",
  "notes.saveAll": "保存全部笔记",
  "notes.split": "切换 Markdown 分屏",
  "notes.terminal": "切换终端",
};

export function NotesShortcutSettings() {
  const [overrides, setOverrides] = useState<NotesShortcutOverrides>(() =>
    loadNotesShortcutOverrides(),
  );
  const [drafts, setDrafts] = useState<NotesShortcutOverrides>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const bindings = useMemo(
    () =>
      CUSTOMIZABLE_BINDINGS.filter((binding) =>
        `${LABELS[binding.commandId] ?? binding.commandId} ${binding.commandId}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [query],
  );
  const conflicts = useMemo(
    () =>
      createDefaultNotesShortcutRegistry(overrides).getConflicts({
        activeSurface: "global",
      }),
    [overrides],
  );

  function commit(bindingId: string, value: string) {
    const normalized = validateNotesShortcut(value);

    if (!normalized) {
      setError("请输入包含实际按键的组合，例如 Mod+Shift+P。");
      return;
    }

    const next = saveNotesShortcutOverrides({
      ...overrides,
      [bindingId]: normalized,
    });
    setOverrides(next);
    setDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[bindingId];
      return nextDrafts;
    });
    setError(null);
  }

  function reset() {
    setOverrides(saveNotesShortcutOverrides({}));
    setDrafts({});
    setError(null);
  }

  function exportShortcuts() {
    const blob = new Blob([serializeNotesShortcutSettings(overrides)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auris-notes-shortcuts.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importShortcuts(file: File) {
    void file
      .text()
      .then((source) => {
        const imported = parseNotesShortcutSettings(JSON.parse(source));
        setOverrides(saveNotesShortcutOverrides(imported));
        setDrafts({});
        setError(null);
      })
      .catch(() => setError("无法导入：请选择有效的 Auris 快捷键 JSON。"));
  }

  return (
    <div className="auris-settings__shortcut-editor">
      <div className="auris-settings__shortcutbar">
        <input
          aria-label="搜索快捷键"
          className="auris-settings__searchinput"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索快捷键…"
          value={query}
        />
        <button type="button" className="auris-settings__btn-sm" onClick={exportShortcuts}>
          导出
        </button>
        <button
          type="button"
          className="auris-settings__btn-sm"
          onClick={() => importRef.current?.click()}
        >
          导入
        </button>
        <button
          type="button"
          className="auris-settings__btn-sm auris-settings__btn-sm--danger"
          onClick={reset}
        >
          全部重置
        </button>
      </div>
      {bindings.map((binding) => {
        const id = getNotesShortcutBindingId(binding);
        const value = drafts[id] ?? overrides[id] ?? binding.key;

        return (
          <label className="auris-settings__row auris-settings__row--split" key={id}>
            <span>
              <strong>{LABELS[binding.commandId] ?? binding.commandId}</strong>
              <small>{binding.commandId}</small>
            </span>
            <input
              aria-label={LABELS[binding.commandId] ?? binding.commandId}
              className="auris-settings__shortcut-input"
              onBlur={(event) => commit(id, event.target.value)}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              value={value}
            />
          </label>
        );
      })}
      {conflicts.length > 0 ? (
        <p className="auris-settings__shortcut-error" role="alert">
          检测到 {conflicts.length} 个同层快捷键冲突；后注册的命令会优先。
        </p>
      ) : null}
      {error ? (
        <p className="auris-settings__shortcut-error" role="alert">
          {error}
        </p>
      ) : null}
      <input
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) importShortcuts(file);
        }}
        ref={importRef}
        type="file"
      />
    </div>
  );
}
