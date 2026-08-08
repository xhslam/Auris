import { getFormatDescriptor } from "@/features/notes/formats/format-registry";

export function normalizeVaultPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

// Named, non-dot folders that hold tooling/assets rather than notes and so
// should never surface in the notes file tree, search, or backlinks.
const HIDDEN_VAULT_ROOTS = new Set(["视频区"]);

export function getVaultFileName(path: string) {
  const normalizedPath = normalizeVaultPath(path);
  return normalizedPath.split("/").at(-1) ?? normalizedPath;
}

export function getVaultBasename(path: string) {
  return getVaultFileName(path).replace(/\.md$/i, "");
}

export type VaultEntryDisplayKind =
  | "markdown"
  | "structured-data"
  | "text"
  | "audio"
  | "attachment";

export function getVaultEntryDisplayKind(path: string): VaultEntryDisplayKind {
  const format = getFormatDescriptor(path);
  if (format.id === "markdown") return "markdown";
  if (format.id === "text" || format.id === "unknown-text") return "text";
  if (format.previewKind === "structured-tree") return "structured-data";
  if (format.id === "audio") return "audio";
  return "attachment";
}

export function ensureMarkdownPath(path: string) {
  const normalizedPath = normalizeVaultPath(path);
  return normalizedPath.toLowerCase().endsWith(".md")
    ? normalizedPath
    : `${normalizedPath}.md`;
}

export function getVaultParentPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const segments = normalized.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

const SYSTEM_FILE_PATTERNS = [
  /^\./,         // dot-files like .DS_Store
  /-lock\.json$/, // e.g. skills-lock.json, package-lock.json
];

export function isSystemVaultFile(path: string): boolean {
  const name = getVaultFileName(path);
  return SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

export function isHiddenVaultPath(path: string) {
  const normalizedPath = normalizeVaultPath(path);

  if (!normalizedPath) {
    return false;
  }

  const rootSegment = normalizedPath.split("/").filter(Boolean)[0] ?? "";

  // Hide every dot-prefixed root folder (".agents", ".claude", ".obsidian", …):
  // by convention these hold config/tooling, not the user's notes. The files
  // stay on disk and remain usable elsewhere — they just don't pollute the
  // notes view. A short named list covers non-dot folders like "视频区".
  return rootSegment.startsWith(".") || HIDDEN_VAULT_ROOTS.has(rootSegment);
}
