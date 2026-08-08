export type NoteOpenStrategy = {
  label: string;
  mode: "full-editor" | "plain-text" | "reduced-editor";
  reason: string;
};

const LARGE_FILE_LIMIT_BYTES = 1 * 1024 * 1024;
const HUGE_FILE_LIMIT_BYTES = 5 * 1024 * 1024;

export function getNoteOpenStrategy(sizeBytes: number): NoteOpenStrategy {
  if (sizeBytes >= HUGE_FILE_LIMIT_BYTES) {
    return {
      label: "Plain text",
      mode: "plain-text",
      reason: "超大文件，建议保持源码编辑并避免实时预览。",
    };
  }

  if (sizeBytes >= LARGE_FILE_LIMIT_BYTES) {
    return {
      label: "Reduced editor",
      mode: "reduced-editor",
      reason: "大文件，已优先使用轻量源码编辑体验。",
    };
  }

  return {
    label: "Full editor",
    mode: "full-editor",
    reason: "普通 Markdown 文件，可使用完整编辑体验。",
  };
}
