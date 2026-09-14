import type { NoteDocument } from "@/features/notes/documents/document-types";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDocumentTitle(document: NoteDocument) {
  return document.parsed.title ?? document.basename;
}

export function buildNoteHtmlExport(document: NoteDocument) {
  const title = getDocumentTitle(document);
  const renderedBody = renderMarkdown(document.rawSource, {
    wikiLinkClickable: false,
  }).replace(/(<h[1-6]) id="[^"]+"/gu, "$1");

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.65;margin:48px auto;max-width:860px;padding:0 24px;color:#1f2937;background:#fff;}",
    "h1,h2,h3{line-height:1.25;color:#111827;break-after:avoid-page;}",
    "table{border-collapse:collapse;width:100%;margin:1rem 0;break-inside:avoid;}",
    "th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;}",
    "blockquote{border-left:4px solid #cbd5e1;margin:1rem 0;padding:.25rem 1rem;color:#475569;background:#f8fafc;break-inside:avoid;}",
    "pre{background:#0f172a;color:#e2e8f0;border-radius:8px;overflow:auto;padding:14px 16px;break-inside:avoid;}",
    "code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;}",
    "img{max-width:100%;height:auto;break-inside:avoid;}",
    ".katex{font-size:1.08em;}",
    ".mermaid{background:#f8fafc;color:#334155;border:1px solid #dbe3ef;}",
    "@page{size:A4;margin:18mm 16mm 20mm;}",
    "</style>",
    "</head>",
    "<body>",
    `<main aria-label=\"${escapeHtml(title)}\">${renderedBody}</main>`,
    "</body>",
    "</html>",
  ].join("\n");
}
