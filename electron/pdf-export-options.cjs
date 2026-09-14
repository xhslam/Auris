"use strict";

const ALLOWED_PAGE_SIZES = new Set([
  "A3",
  "A4",
  "A5",
  "Legal",
  "Letter",
]);

const PAGE_FOOTER_TEMPLATE = [
  '<div style="width:100%;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:8px;color:#64748b;text-align:center;padding:0 10mm">',
  '<span class="pageNumber"></span> / <span class="totalPages"></span>',
  "</div>",
].join("");

const DEFAULT_PDF_EXPORT_OPTIONS = Object.freeze({
  displayHeaderFooter: true,
  footerTemplate: PAGE_FOOTER_TEMPLATE,
  generateDocumentOutline: true,
  generateTaggedPDF: true,
  landscape: false,
  pageSize: "A4",
  preferCSSPageSize: true,
  printBackground: true,
});

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizePdfExportOptions(value) {
  if (!isPlainObject(value)) {
    return DEFAULT_PDF_EXPORT_OPTIONS;
  }

  const pageSize = ALLOWED_PAGE_SIZES.has(value.pageSize)
    ? value.pageSize
    : DEFAULT_PDF_EXPORT_OPTIONS.pageSize;

  return Object.freeze({
    ...DEFAULT_PDF_EXPORT_OPTIONS,
    generateDocumentOutline: typeof value.generateDocumentOutline === "boolean"
      ? value.generateDocumentOutline
      : DEFAULT_PDF_EXPORT_OPTIONS.generateDocumentOutline,
    generateTaggedPDF: typeof value.generateTaggedPDF === "boolean"
      ? value.generateTaggedPDF
      : DEFAULT_PDF_EXPORT_OPTIONS.generateTaggedPDF,
    landscape: typeof value.landscape === "boolean"
      ? value.landscape
      : DEFAULT_PDF_EXPORT_OPTIONS.landscape,
    pageSize,
  });
}

module.exports = {
  DEFAULT_PDF_EXPORT_OPTIONS,
  normalizePdfExportOptions,
};
