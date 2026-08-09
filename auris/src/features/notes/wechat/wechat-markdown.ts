import MarkdownIt from "markdown-it";

export type WechatMarkdownRenderOptions = {
  resolveImageSource?: (source: string) => string | null;
};

type WechatMarkdownEnvironment = WechatMarkdownRenderOptions;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', sans-serif";
const MONO_STACK =
  "'SF Mono', Consolas, 'Liberation Mono', Menlo, Monaco, monospace";
const ACCENT = "#0366d6";
const ACCENT_SOFT = "rgba(3,102,214,0.08)";
const ACCENT_TINT = "rgba(3,102,214,0.12)";
const TEXT = "#3e3e3e";
const BORDER = "#e1e4e8";

const WECHAT_STYLES = {
  root: `font-family:${FONT_STACK};font-size:16px;line-height:1.8;color:${TEXT};padding:16px;background:#ffffff;max-width:100%;word-wrap:break-word;text-align:justify;box-sizing:border-box;`,
  p: `font-family:${FONT_STACK};font-size:16px;line-height:1.8;color:${TEXT};margin:0 0 20px 0;text-align:justify;letter-spacing:0;`,
  h1: `font-family:${FONT_STACK};display:block;font-size:34px;font-weight:800;margin:30px auto 20px;color:#333333;text-align:center;line-height:1.2;`,
  h2: `font-family:${FONT_STACK};display:block;font-size:28px;font-weight:800;margin:40px auto 20px;color:#333333;text-align:center;line-height:1.25;`,
  h3: `font-family:${FONT_STACK};display:inline-block;font-size:22px;font-weight:800;margin:24px 0 16px;color:#333333;text-align:left;line-height:1.3;border-bottom:2px solid ${ACCENT};padding-bottom:4px;`,
  h4: `font-family:${FONT_STACK};display:inline-block;font-size:18px;font-weight:700;margin:15px 0 10px;color:${ACCENT};text-align:left;line-height:1.35;background:${ACCENT_SOFT};padding:4px 8px;border-radius:4px;`,
  h5: `font-family:${FONT_STACK};display:block;font-size:16px;font-weight:700;margin:10px 0;color:${TEXT};text-align:left;line-height:1.4;`,
  h6: `font-family:${FONT_STACK};display:block;font-size:16px;font-weight:700;margin:10px 0;color:${TEXT};text-align:left;line-height:1.4;`,
  blockquote: `font-family:${FONT_STACK};font-size:16px;line-height:1.8;color:#595959;background:${ACCENT_TINT};margin:16px 0;padding:16px;border:1px solid rgba(3,102,214,0.28);border-radius:4px;`,
  ul: `font-family:${FONT_STACK};font-size:16px;line-height:1.8;color:${TEXT};margin:12px 0;padding-left:20px;list-style-type:disc;`,
  ol: `font-family:${FONT_STACK};font-size:16px;line-height:1.8;color:${TEXT};margin:12px 0;padding-left:20px;list-style-type:decimal;`,
  li: `font-size:16px;line-height:1.8;color:${TEXT};margin:4px 0;`,
  listParagraph: "margin:0;padding:0;line-height:1.8;",
  code: `background:${ACCENT_TINT};color:${ACCENT};padding:2px 4px;border-radius:3px;font-family:${MONO_STACK};font-size:14px;`,
  link: `color:${ACCENT};text-decoration:underline;border-bottom:none;`,
  strong: `font-weight:700;color:${ACCENT};`,
  em: "font-style:italic;",
  del: "text-decoration:line-through;color:#999999;",
  figure: "display:block;margin:20px 0;text-align:center;",
  image: "display:block;margin:0 auto;max-width:100%;height:auto;border-radius:4px;",
  figcaption: "font-size:13px;color:#999999;text-align:center;margin-top:8px;line-height:1.5;",
  table: `border-collapse:collapse;width:100%;margin:16px 0;border:1px solid ${BORDER};table-layout:auto;`,
  thead: "background:#f6f8fa;",
  tbody: "background:#ffffff;",
  tr: "break-inside:avoid;",
  th: `background:${ACCENT_TINT};font-weight:700;color:${TEXT};border:1px solid ${BORDER};padding:10px;text-align:left;`,
  td: `color:${TEXT};border:1px solid ${BORDER};padding:10px;text-align:left;`,
  hr: "border:0;border-top:1px solid rgba(0,0,0,0.08);margin:40px 0;",
  codeShell: "width:100%;margin:12px 0;background:#0d1117;border:1px solid #30363d;border-radius:8px;overflow:hidden;display:block;box-sizing:border-box;",
  codeHeader: "display:block;background:#161b22;padding:10px;border-bottom:1px solid #30363d;line-height:1;",
  codeBody: `display:block;margin:0;padding:12px;background:#0d1117;color:#f0f6fc;font-family:${MONO_STACK};font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;box-sizing:border-box;`,
} as const;

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "");
}

function preprocessWikiSyntax(markdown: string) {
  return markdown
    .replace(/!\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/gu, (_match, source: string, alt?: string) => {
      const normalizedSource = source.trim();
      return `![${(alt ?? "").trim()}](${encodeURI(normalizedSource)})`;
    })
    .replace(/(?<!!)\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/gu, (_match, target: string, label?: string) =>
      (label ?? target).trim(),
    );
}

function sanitizeLinkHref(href: string) {
  const trimmed = href.trim();
  return /^(?:https?:\/\/|mailto:|tel:|#)/iu.test(trimmed) ? trimmed : "";
}

function sanitizeImageSource(source: string) {
  const trimmed = source.trim();
  return /^(?:https?:\/\/|shadowing-media:\/\/|app:\/\/|blob:|file:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/iu.test(trimmed)
    ? trimmed
    : "";
}

function resolveImageSource(
  source: string,
  environment: WechatMarkdownEnvironment,
) {
  let decoded = source;
  try {
    decoded = decodeURI(source);
  } catch {
    // Keep malformed but already escaped sources visible instead of crashing preview.
  }

  return sanitizeImageSource(environment.resolveImageSource?.(decoded) ?? decoded);
}

function createMarkdownRenderer() {
  const markdown = MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: true,
  }).enable("table");

  const rules = markdown.renderer.rules;
  rules.paragraph_open = () => `<p style="${WECHAT_STYLES.p}">`;
  rules.heading_open = (tokens, index) => {
    const tag = tokens[index].tag as keyof Pick<
      typeof WECHAT_STYLES,
      "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
    >;
    return `<${tag} style="${WECHAT_STYLES[tag]}">`;
  };
  rules.blockquote_open = () => `<blockquote style="${WECHAT_STYLES.blockquote}">`;
  rules.bullet_list_open = () => `<ul style="${WECHAT_STYLES.ul}">`;
  rules.ordered_list_open = (tokens, index) => {
    const start = tokens[index].attrGet("start");
    return `<ol${start ? ` start="${markdown.utils.escapeHtml(start)}"` : ""} style="${WECHAT_STYLES.ol}">`;
  };
  rules.list_item_open = () => `<li style="${WECHAT_STYLES.li}">`;
  rules.code_inline = (tokens, index) =>
    `<code style="${WECHAT_STYLES.code}">${markdown.utils.escapeHtml(tokens[index].content)}</code>`;
  rules.fence = (tokens, index) => {
    const escaped = markdown.utils.escapeHtml(
      tokens[index].content.replace(/\n$/u, "").replaceAll("\t", "    "),
    );
    return `<section data-auris-wechat-code="true" style="${WECHAT_STYLES.codeShell}"><section aria-hidden="true" style="${WECHAT_STYLES.codeHeader}"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5f57;margin-right:8px;"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffbd2e;margin-right:8px;"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#28c840;"></span></section><pre style="${WECHAT_STYLES.codeBody}">${escaped}</pre></section>`;
  };
  rules.code_block = rules.fence;
  rules.link_open = (tokens, index) => {
    const href = sanitizeLinkHref(tokens[index].attrGet("href") ?? "");
    return `<a href="${markdown.utils.escapeHtml(href)}" style="${WECHAT_STYLES.link}">`;
  };
  rules.strong_open = () => `<strong style="${WECHAT_STYLES.strong}">`;
  rules.em_open = () => `<em style="${WECHAT_STYLES.em}">`;
  rules.s_open = () => `<del style="${WECHAT_STYLES.del}">`;
  rules.s_close = () => "</del>";
  rules.image = (tokens, index, _options, environment: WechatMarkdownEnvironment) => {
    const token = tokens[index];
    const source = resolveImageSource(token.attrGet("src") ?? "", environment);
    const alt = token.content.trim();
    const escapedAlt = markdown.utils.escapeHtml(alt);
    if (!source) {
      return alt
        ? `<p style="${WECHAT_STYLES.figcaption}">${escapedAlt}</p>`
        : "";
    }

    const escapedSource = markdown.utils.escapeHtml(source);
    const caption = alt
      ? `<p style="${WECHAT_STYLES.figcaption}">${escapedAlt}</p>`
      : "";
    return `<section style="${WECHAT_STYLES.figure}"><img src="${escapedSource}" alt="${escapedAlt}" style="${WECHAT_STYLES.image}">${caption}</section>`;
  };
  rules.hr = () => `<hr style="${WECHAT_STYLES.hr}">`;
  rules.table_open = () => `<table style="${WECHAT_STYLES.table}">`;
  rules.thead_open = () => `<thead style="${WECHAT_STYLES.thead}">`;
  rules.tbody_open = () => `<tbody style="${WECHAT_STYLES.tbody}">`;
  rules.tr_open = () => `<tr style="${WECHAT_STYLES.tr}">`;
  rules.th_open = () => `<th style="${WECHAT_STYLES.th}">`;
  rules.td_open = () => `<td style="${WECHAT_STYLES.td}">`;

  return markdown;
}

const markdownRenderer = createMarkdownRenderer();

function normalizeRenderedHtml(html: string) {
  return html
    .replace(/<li([^>]*)>[\s\S]*?<\/li>/gu, (item) =>
      item.replace(/<p style="[^"]*">/gu, `<p style="${WECHAT_STYLES.listParagraph}">`),
    )
    .replace(/<blockquote([^>]*)>([\s\S]*?)<\/blockquote>/gu, (_match, attributes: string, content: string) =>
      `<blockquote${attributes}>${content.replace(/<p style="[^"]*">/gu, '<p style="margin:0;padding:0;line-height:1.8;">')}</blockquote>`,
    )
    .replace(/<p[^>]*>\s*(<section[\s\S]*?<\/section>)\s*<\/p>/giu, "$1");
}

export function renderWechatMarkdown(
  markdown: string,
  options: WechatMarkdownRenderOptions = {},
) {
  const source = preprocessWikiSyntax(stripFrontmatter(markdown));
  const rendered = markdownRenderer.render(source, options);
  return `<section data-auris-wechat-content="true" style="${WECHAT_STYLES.root}">${normalizeRenderedHtml(rendered)}</section>`;
}
