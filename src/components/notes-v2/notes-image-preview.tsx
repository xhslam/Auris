"use client";

import { useState } from "react";
import { resolveMarkdownImageSource } from "@/features/notes/editor/code-block-preview";

// Only formats Chromium can display directly; other attachments stay non-editable.
export function isNotesImagePath(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(path);
}

export function NotesImagePreview({ path, onClose }: { path: string; onClose: () => void }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  // Reuse Auris's vault-scoped media resolver (VMark resolveMediaPath equivalent).
  // Encode literal filenames first: the Markdown resolver decodes exactly once.
  const source = resolveMarkdownImageSource(path.split("/").map(encodeURIComponent).join("/"), null, revision);
  const name = path.split("/").at(-1) ?? path;
  const changeZoom = (delta: number) => setZoom((current) => Math.min(4, Math.max(0.25, (current ?? 1) + delta)));

  return (
    <section aria-label="图片查看" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}>
      <div role="toolbar" aria-label="图片查看工具" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", flexWrap: "wrap" }}>
        <span style={{ flex: 1, overflowWrap: "anywhere" }}>{name}</span>
        <button type="button" onClick={() => setZoom(null)} aria-pressed={zoom === null}>适应窗口</button>
        <button type="button" onClick={() => setZoom(1)} aria-pressed={zoom === 1}>原图</button>
        <button type="button" aria-label="缩小图片" disabled={zoom === 0.25} onClick={() => changeZoom(-0.25)}>−</button>
        <span aria-live="polite">{zoom === null ? "自动" : `${Math.round(zoom * 100)}%`}</span>
        <button type="button" aria-label="放大图片" disabled={zoom === 4} onClick={() => changeZoom(0.25)}>＋</button>
        <button type="button" onClick={onClose}>关闭图片</button>
      </div>
      <div tabIndex={0} aria-label="图片画布" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        {status === "loading" ? <p role="status">正在加载图片…</p> : null}
        {status === "error" || !source ? (
          <div role="alert">无法加载图片。<button type="button" onClick={() => { setStatus("loading"); setRevision((value) => value + 1); }}>重试</button></div>
        ) : null}
        {source ? (
          // Local vault media uses the existing custom protocol, not Next image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={source} src={source} alt={name} onLoad={() => setStatus("ready")} onError={() => setStatus("error")}
            style={{ display: status === "error" ? "none" : "block", margin: "0 auto", maxWidth: zoom === null ? "100%" : "none", maxHeight: zoom === null ? "100%" : "none", width: "auto", height: "auto", zoom: zoom ?? 1, objectFit: "contain" }} />
        ) : null}
      </div>
    </section>
  );
}
