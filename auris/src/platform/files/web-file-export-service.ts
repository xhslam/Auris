export type WebFileExportService = {
  exportJson: (filename: string, payload: unknown) => Promise<void>;
  exportPdf: (filename: string, html: string) => Promise<void>;
  exportText: (
    filename: string,
    content: string,
    contentType?: string,
  ) => Promise<void>;
  kind: "web";
};

function downloadText(filename: string, content: string, contentType: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("WEB_FILE_EXPORT_UNAVAILABLE");
  }

  const blob = new Blob([content], {
    type: contentType,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createWebFileExportService(): WebFileExportService {
  return {
    kind: "web",
    async exportJson(filename: string, payload: unknown) {
      downloadText(
        filename,
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
      );
    },
    async exportPdf(filename: string, html: string) {
      downloadText(filename.replace(/\.pdf$/i, ".html"), html, "text/html;charset=utf-8");
    },
    async exportText(
      filename: string,
      content: string,
      contentType = "text/plain;charset=utf-8",
    ) {
      downloadText(filename, content, contentType);
    },
  };
}
