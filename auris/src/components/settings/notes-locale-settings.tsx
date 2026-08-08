"use client";

import {
  saveNotesLocale,
  useNotesLocale,
  type NotesLocale,
} from "@/features/notes/i18n/notes-locale";

export function NotesLocaleSettings() {
  const locale = useNotesLocale();

  return (
    <div className="auris-settings__row auris-settings__row--split">
      <div className="auris-settings__row-text">
        <div className="auris-settings__row-label">Notes 界面语言</div>
        <div className="auris-settings__row-desc">
          切换笔记工作台、命令面板、文件树、属性、搜索、终端和错误提示。
        </div>
      </div>
      <select
        aria-label="Notes 界面语言"
        className="auris-settings__select"
        onChange={(event) =>
          saveNotesLocale(event.target.value as NotesLocale)
        }
        value={locale}
      >
        <option value="zh-CN">简体中文</option>
        <option value="en-US">English</option>
      </select>
    </div>
  );
}
