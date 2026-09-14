import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const safeMarkdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize)
  .use(rehypeStringify)
  .freeze();

export function renderNiaMarkdown(markdown: string) {
  return String(safeMarkdown.processSync(markdown));
}

export function NiaResponse({ content }: { content: string }) {
  if (!content) return <p className="nia-response nia-response--empty">Nia 的回复会显示在这里。</p>;
  return (
    <div
      aria-label="Nia response"
      className="nia-response"
      dangerouslySetInnerHTML={{ __html: renderNiaMarkdown(content) }}
    />
  );
}
