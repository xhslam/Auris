"use client";

import type { Root } from "mdast";
import { useEffect, useId, useRef, useState } from "react";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { parseNotesMarkdownAst } from "@/features/notes/markdown/notes-markdown-dialect";
import { unified } from "unified";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";

const evaluationMarkdown = unified()
  .use(remarkRehype)
  .use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: defaultSchema.tagNames?.filter(tag => tag !== "img" && tag !== "a"),
  })
  .use(rehypeStringify)
  .freeze();

function renderEvaluation(markdown: string) {
  const tree = parseNotesMarkdownAst(markdown) as Root;
  const start = tree.children.findIndex(node => node.type === "heading"
    && node.children.length === 1
    && node.children[0].type === "text"
    && ["具体评价", "每日评价"].includes(node.children[0].value.trim()));
  const heading = tree.children[start];
  if (heading?.type !== "heading") return "";

  const end = tree.children.findIndex((node, index) =>
    index > start && node.type === "heading" && node.depth <= heading.depth);
  const children = tree.children.slice(start + 1, end === -1 ? undefined : end);
  const result = evaluationMarkdown.runSync({ type: "root", children });
  return evaluationMarkdown.stringify(result).trim();
}

type Evaluation = { html: string } | { message: string };

async function readEvaluation(date: string): Promise<Evaluation> {
  const vault = getDesktopBridge()?.vault;
  const directory = await vault?.getDirectoryInfo();
  if (!vault || !directory?.hasVault) {
    return { message: "请先在笔记中打开 daily 文件夹或包含它的目录。" };
  }

  const filename = `${date}.md`;
  const relativePath = directory.directoryName?.toLowerCase() === "daily" ? filename : `daily/${filename}`;
  const markdown = await vault.readFile(relativePath);
  if (markdown === null) {
    return { message: "当前笔记目录中没有这一天的 daily 日记。" };
  }

  const html = renderEvaluation(markdown);
  return html ? { html } : { message: "这篇日记还没有填写评价。" };
}

export function DailyEvaluationDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Evaluation | null>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);

  useEffect(() => {
    let active = true;
    void readEvaluation(date).then(
      evaluation => { if (active) setResult(evaluation); },
      () => { if (active) setResult({ message: "暂时无法读取日记，请关闭后重试。" }); },
    );
    return () => { active = false; };
  }, [date]);

  function close() {
    dialog.current?.close();
    onClose();
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className="review-workspace__evaluation"
      onCancel={event => { event.preventDefault(); close(); }}
      ref={dialog}
    >
      <header className="review-workspace__bar">
        <div>
          <h2 id={titleId}>每日评价</h2>
          <time dateTime={date}>{date}</time>
        </div>
        <button aria-label="关闭每日评价" onClick={close} type="button">×</button>
      </header>
      <div className="review-workspace__evaluation-body">
        {result && "html" in result
          ? <div dangerouslySetInnerHTML={{ __html: result.html }} />
          : <p role="status">{result?.message ?? "正在读取日记…"}</p>}
      </div>
    </dialog>
  );
}
