import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  DEFAULT_PDF_EXPORT_OPTIONS,
  normalizePdfExportOptions,
} = require("../../../electron/pdf-export-options.cjs");

describe("PDF export options", () => {
  it("defaults to an accessible A4 PDF with document outline and page footer", () => {
    expect(DEFAULT_PDF_EXPORT_OPTIONS).toMatchObject({
      displayHeaderFooter: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
      landscape: false,
      pageSize: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(DEFAULT_PDF_EXPORT_OPTIONS.footerTemplate).toContain("pageNumber");
    expect(DEFAULT_PDF_EXPORT_OPTIONS.footerTemplate).toContain("totalPages");
  });

  it("accepts only bounded presentation options and keeps accessibility defaults", () => {
    expect(normalizePdfExportOptions({ landscape: true, pageSize: "Letter" })).toMatchObject({
      generateDocumentOutline: true,
      generateTaggedPDF: true,
      landscape: true,
      pageSize: "Letter",
    });

    expect(normalizePdfExportOptions({
      generateDocumentOutline: false,
      generateTaggedPDF: false,
      landscape: "yes",
      pageSize: "unknown",
    })).toMatchObject({
      generateDocumentOutline: false,
      generateTaggedPDF: false,
      landscape: false,
      pageSize: "A4",
    });
  });

  it("ignores null, arrays, and arbitrary renderer payload fields", () => {
    const fromNull = normalizePdfExportOptions(null);
    const fromArray = normalizePdfExportOptions(["A3"]);
    const fromPayload = normalizePdfExportOptions({
      footerTemplate: "<script>window.__bad = true</script>",
      pageRanges: "1-999999",
      printBackground: false,
    });

    expect(fromNull).toEqual(DEFAULT_PDF_EXPORT_OPTIONS);
    expect(fromArray).toEqual(DEFAULT_PDF_EXPORT_OPTIONS);
    expect(fromPayload).toEqual(DEFAULT_PDF_EXPORT_OPTIONS);
  });
});
