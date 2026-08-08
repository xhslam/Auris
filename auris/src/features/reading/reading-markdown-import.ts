import {
  buildReadingSourceFromExamMarkdown,
  parseReadingExamMarkdown,
  stripMarkdownFrontmatter,
} from "@/features/reading/reading-exam-parse";
import { buildReadingSourceFromPlainText } from "@/features/reading/reading-import-shared";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

export const READING_MARKDOWN_ACCEPT =
  ".md,.markdown,.mdown,.mdx,text/markdown,text/x-markdown";

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown", ".mdx", ".mkdn"];
const TITLE_EXTENSION = /\.(md|markdown|mdown|mdx|mkdn)$/i;

function isMarkdownFile(file: File) {
  const name = file.name.toLowerCase();
  if (MARKDOWN_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return true;
  }

  return (
    file.type === "text/markdown" ||
    file.type === "text/x-markdown"
  );
}

/**
 * Strip YAML frontmatter and light Markdown syntax so the reading pane gets
 * plain paragraphs — used when there is no exam-type marker.
 */
export function markdownToPlainText(markdown: string) {
  const text = stripMarkdownFrontmatter(markdown);

  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .trim();
}

/**
 * Reads a local Markdown file and turns it into an in-memory reading source.
 * Exam markers (`## 题型:`) produce structured exam sections; otherwise
 * empty-line bilingual paragraphs.
 */
export async function createReadingSourceFromMarkdownFile(
  file: File,
  options: { category?: ReadingSource["category"] } = {},
): Promise<ReadingSource> {
  if (!isMarkdownFile(file)) {
    throw new Error("仅支持 .md / .markdown 等 Markdown 文件。");
  }

  const raw = await file.text();
  const examSections = parseReadingExamMarkdown(raw);
  const category = options.category ?? "article";

  if (examSections) {
    return buildReadingSourceFromExamMarkdown({
      category,
      fileName: file.name,
      idPrefix: "markdown-reading",
      markdown: raw,
      sections: examSections,
      titleExtensionPattern: TITLE_EXTENSION,
    });
  }

  const plain = markdownToPlainText(raw);

  if (!plain) {
    throw new Error("这个 Markdown 文件里没有可导入的文字。");
  }

  try {
    return buildReadingSourceFromPlainText({
      category,
      fileName: file.name,
      idPrefix: "markdown-reading",
      text: plain,
      titleExtensionPattern: TITLE_EXTENSION,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("没有可导入")) {
      throw new Error("这个 Markdown 文件里没有可导入的文字。");
    }
    throw error;
  }
}
