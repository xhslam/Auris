import {
  READING_MARKDOWN_ACCEPT,
  createReadingSourceFromMarkdownFile,
} from "@/features/reading/reading-markdown-import";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

/** File picker accept list — Markdown only. */
export const READING_IMPORT_ACCEPT = READING_MARKDOWN_ACCEPT;

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown", ".mdx", ".mkdn"];

function getExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function isMarkdownFile(file: File) {
  const ext = getExtension(file.name);
  if (MARKDOWN_EXTENSIONS.includes(ext)) {
    return true;
  }

  return file.type === "text/markdown" || file.type === "text/x-markdown";
}

/**
 * Imports a local Markdown file into a ReadingSource.
 * Word / PDF are rejected — convert with hg-word-suitability first.
 */
export async function createReadingSourceFromFile(
  file: File,
  options: { category?: ReadingSource["category"] } = {},
): Promise<ReadingSource> {
  if (!isMarkdownFile(file)) {
    throw new Error(
      "阅读区仅支持 Markdown（.md）。请先用 hg-word-suitability 把 Word/PDF 转成 MD 再导入。",
    );
  }

  return createReadingSourceFromMarkdownFile(file, options);
}

export {
  READING_MARKDOWN_ACCEPT,
  createReadingSourceFromMarkdownFile,
};
