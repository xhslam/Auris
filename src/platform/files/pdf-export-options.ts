export type PdfExportOptions = Readonly<{
  generateDocumentOutline?: boolean;
  generateTaggedPDF?: boolean;
  landscape?: boolean;
  pageSize?: "A3" | "A4" | "A5" | "Legal" | "Letter";
}>;
