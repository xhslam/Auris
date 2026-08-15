import { deriveReadingTitle } from "@/features/reading/reading-import-shared";
import type { ReadingSource } from "@/features/reading/reading-fixtures";
import { saveReadingPdfBytes } from "@/features/reading/reading-pdf-store";

export const READING_PDF_ACCEPT = ".pdf,application/pdf";

type PdfJsModule = typeof import("pdfjs-dist");

let workerConfigured = false;

function isPdfFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".pdf") || file.type === "application/pdf";
}

function ensurePdfWorker(pdfjs: PdfJsModule) {
  if (workerConfigured) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  workerConfigured = true;
}

async function getPdfPageCount(arrayBuffer: ArrayBuffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  ensurePdfWorker(pdfjs);

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return pageCount;
}

/**
 * Imports a local PDF as an original-layout reading source.
 * Keeps the binary for the PDF viewer; does not flatten into paragraphs.
 */
export async function createReadingSourceFromPdfFile(
  file: File,
): Promise<ReadingSource> {
  if (!isPdfFile(file)) {
    throw new Error("仅支持 .pdf 格式的 PDF 文档。");
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("这个 PDF 文件是空的。");
  }

  let pageCount = 1;
  try {
    pageCount = Math.max(1, await getPdfPageCount(arrayBuffer));
  } catch {
    throw new Error("无法读取这个 PDF，请确认文件未损坏。");
  }

  const sourceId = `pdf-reading-${Date.now()}`;
  const importedAt = new Date().toISOString();
  const title = deriveReadingTitle(file.name, file.name, /\.pdf$/i);
  const pdfBytes = arrayBuffer.slice(0);

  try {
    await saveReadingPdfBytes({
      bytes: pdfBytes.slice(0),
      id: sourceId,
      mimeType: file.type || "application/pdf",
      title,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // IndexedDB may be unavailable in some test/SSR paths; session still works.
  }

  return {
    category: "article",
    estimatedMinutes: Math.max(1, Math.ceil(pageCount * 1.5)),
    format: "pdf",
    id: sourceId,
    importedAt,
    kicker: file.name,
    originalFileName: file.name,
    pageCount,
    paragraphs: [],
    pdfBytes,
    progress: 0,
    title,
  };
}

export { ensurePdfWorker };
