import mammoth from "mammoth";
import { buildReadingSourceFromPlainText } from "@/features/reading/reading-import-shared";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

/** Word documents we can parse in the browser via mammoth. */
export const READING_WORD_ACCEPT =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocxFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/**
 * Reads a local Word (.docx) file and turns it into an in-memory reading
 * source. Raw text is extracted; blank-line English/Chinese pairs become
 * bilingual paragraphs. Unpaired English keeps a translation placeholder.
 */
export async function createReadingSourceFromWordFile(
  file: File,
): Promise<ReadingSource> {
  if (!isDocxFile(file)) {
    throw new Error("仅支持 .docx 格式的 Word 文档。");
  }

  const arrayBuffer = await file.arrayBuffer();
  const { value: text } = await mammoth.extractRawText({ arrayBuffer });
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("这个 Word 文档里没有可导入的文字。");
  }

  try {
    return buildReadingSourceFromPlainText({
      fileName: file.name,
      idPrefix: "word-reading",
      text: trimmed,
      titleExtensionPattern: /\.docx$/i,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("没有可导入")) {
      throw new Error("这个 Word 文档里没有可导入的文字。");
    }
    throw error;
  }
}
