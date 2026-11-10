"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { createContentMermaidPrompt, getContentMermaid } from "@/features/notes/graph/content-mermaid";
import { useAppTheme } from "@/features/appearance/use-app-theme";
import { renderArticleMermaid } from "./notes-content-mermaid-renderer";
import styles from "./notes-content-mermaid.module.css";

function Diagram({ code }: { code: string }) {
  const theme = useAppTheme();
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ code: string; error?: string; ready?: boolean }>({ code });
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    let cancelled = false;
    const target = host.current;
    if (target) target.replaceChildren();
    setState({ code });
    void renderArticleMermaid(code, theme).then(svg => {
      if (cancelled || !target) return;
      target.innerHTML = svg;
      setState({ code, ready: true });
    }).catch(error => {
      if (!cancelled) setState({ code, error: error instanceof Error ? error.message : "Mermaid 渲染失败" });
    });
    return () => { cancelled = true; };
  }, [code, theme]);
  const current = state.code === code ? state : { code };
  return (
    <div className={styles.diagram}>
      <div className={styles.zoom} role="group" aria-label="图缩放">
        <button type="button" aria-label="缩小图" disabled={zoom <= 50} onClick={() => setZoom(v => Math.max(50, v - 25))}>−</button>
        <button type="button" aria-label="重置图缩放" onClick={() => setZoom(100)}>{zoom}%</button>
        <button type="button" aria-label="放大图" disabled={zoom >= 300} onClick={() => setZoom(v => Math.min(300, v + 25))}>+</button>
      </div>
      {current.error ? <p role="alert" className={styles.error}>无法渲染 Mermaid 图：{current.error}</p> : !current.ready ? <p role="status">正在渲染…</p> : null}
      <div className={styles.viewport}>
        <div className={styles.svg} data-testid="article-mermaid-svg" ref={host} style={{ width: `${zoom}%` }} onClick={event => event.preventDefault()} />
      </div>
      <details><summary>Mermaid 源码</summary><pre>{code}</pre></details>
    </div>
  );
}

export function NotesContentMermaidPanel({ document }: { document: NoteDocument | null }) {
  const graph = useMemo(() => getContentMermaid(document?.rawSource ?? ""), [document?.rawSource]);
  // Key per path prevents clipboard feedback and zoom leaking into another note.
  return document ? <ArticlePanel key={document.path} path={document.path} graph={graph} /> : <p className="notes-v2__empty-copy">请先打开一篇笔记。</p>;
}

function ArticlePanel({ path, graph }: { path: string; graph: ReturnType<typeof getContentMermaid> }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const prompt = createContentMermaidPrompt(path);
  return (
    <section aria-label="文章 Mermaid 图" className={styles.panel}>
      {graph.error ? <p role="alert" className={styles.error}>{graph.error}</p> : null}
      {!graph.error && graph.diagrams.length === 0 ? <p>这篇文章还没有 Mermaid 图。</p> : null}
      {graph.diagrams.length === 0 ? <p>复制此段指令，让 Agent 根据文章生成图并写入此区域。</p> : null}
      {graph.stale ? <p className={styles.notice}>正文已变化，可让 Agent 更新图。</p> : null}
      <div className={styles.actions}>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(prompt);
            setCopyState("copied");
          } catch { setCopyState("failed"); }
        }}>复制 Agent 生成指令</button>
        {copyState === "copied" ? <span role="status">已复制，粘贴给 Agent 即可。</span> : null}
      </div>
      <details open={copyState === "failed" ? true : undefined}>
        <summary>查看生成指令</summary>
        {copyState === "failed" ? <p role="status">复制失败，请手动选择下方指令。</p> : null}
        <textarea aria-label="Agent 生成指令" readOnly value={prompt} rows={7} onFocus={event => event.currentTarget.select()} />
      </details>
      {graph.diagrams.map((code, index) => <Diagram key={`${path}:${index}`} code={code} />)}
    </section>
  );
}
