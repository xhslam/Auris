/**
 * Generic page reader — DOM → clean Markdown.
 *
 * Adapted from VMark `src/lib/browser/reader/reader.ts` (xiaolai/vmark@7c409688).
 * Adds explicit character budget + truncation metadata. Never embeds executable
 * page code as interpolated strings.
 */

export type CleanReaderResult = {
  title: string;
  byline: string | null;
  url: string;
  markdown: string;
  textLength: number;
  truncated: boolean;
};

export type CleanReaderBudget = {
  /** Maximum markdown characters to retain after extraction. */
  maxMarkdownChars: number;
};

const DEFAULT_BUDGET: CleanReaderBudget = { maxMarkdownChars: 200_000 };

const HEADINGS: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};
const DROP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "form"]);

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function longestBacktickRun(s: string): number {
  const runs = s.match(/`+/gu);
  return runs ? Math.max(...runs.map((r) => r.length)) : 0;
}

function mdDestination(url: string): string {
  return /[()\s]/u.test(url) ? `<${url}>` : url;
}

function serializeChildren(el: Element, baseUrl: string): string {
  let out = "";
  el.childNodes.forEach((node) => {
    out += serializeNode(node, baseUrl);
  });
  return out;
}

function listItems(el: Element): Element[] {
  return Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
}

function escapeText(text: string): string {
  return text
    .replace(/\\/gu, "\\\\")
    .replace(/([`*_[\]<])/gu, "\\$1")
    .replace(/^(\s*)([-+>#])/u, "$1\\$2")
    .replace(/^(\s*)(\d+)\./u, "$1$2\\.");
}

function serializeNode(node: Node, baseUrl: string): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return escapeText((node.textContent ?? "").replace(/\s+/gu, " "));
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return "";

  const heading = HEADINGS[tag];
  if (heading) {
    return `\n\n${"#".repeat(heading)} ${serializeChildren(el, baseUrl).trim()}\n\n`;
  }

  switch (tag) {
    case "p":
      return `\n\n${serializeChildren(el, baseUrl).trim()}\n\n`;
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "strong":
    case "b": {
      const inner = serializeChildren(el, baseUrl).trim();
      return inner ? `**${inner}**` : "";
    }
    case "em":
    case "i": {
      const inner = serializeChildren(el, baseUrl).trim();
      return inner ? `*${inner}*` : "";
    }
    case "code": {
      const code = el.textContent ?? "";
      const fence = "`".repeat(longestBacktickRun(code) + 1);
      const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
      return `${fence}${pad}${code}${pad}${fence}`;
    }
    case "pre": {
      const body = (el.textContent ?? "").replace(/\n+$/u, "");
      const fence = "`".repeat(Math.max(3, longestBacktickRun(body) + 1));
      return `\n\n${fence}\n${body}\n${fence}\n\n`;
    }
    case "a": {
      const href = el.getAttribute("href");
      const text = serializeChildren(el, baseUrl).trim();
      return href ? `[${text}](${mdDestination(resolveUrl(href, baseUrl))})` : text;
    }
    case "img": {
      const src = el.getAttribute("src");
      if (!src) return "";
      const alt = escapeText(normalizeWs(el.getAttribute("alt") ?? ""));
      return `![${alt}](${mdDestination(resolveUrl(src, baseUrl))})`;
    }
    case "ul":
      return `\n\n${listItems(el)
        .map((li) => `- ${serializeChildren(li, baseUrl).trim()}`)
        .join("\n")}\n\n`;
    case "ol":
      return `\n\n${listItems(el)
        .map((li, i) => `${i + 1}. ${serializeChildren(li, baseUrl).trim()}`)
        .join("\n")}\n\n`;
    case "blockquote": {
      const inner = serializeChildren(el, baseUrl).trim();
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `\n\n${quoted}\n\n`;
    }
    case "table":
      return serializeTable(el, baseUrl);
    default:
      return serializeChildren(el, baseUrl);
  }
}

function serializeTable(el: Element, baseUrl: string): string {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const cellsFor = (row: Element) =>
    Array.from(row.children)
      .filter((c) => {
        const tag = c.tagName.toLowerCase();
        return tag === "td" || tag === "th";
      })
      .map((c) => serializeChildren(c, baseUrl).trim().replace(/\|/gu, "\\|"));
  const matrix = rows.map(cellsFor);
  const width = Math.max(...matrix.map((row) => row.length), 1);
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => row[i] ?? "");
  const header = pad(matrix[0]!);
  const body = matrix.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
  return `\n\n${lines.join("\n")}\n\n`;
}

function toMarkdown(el: Element, baseUrl: string): string {
  return serializeChildren(el, baseUrl)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const NOISE = "nav, aside, footer, header, form, iframe, svg, script, style, noscript";

function contentScore(el: Element): number {
  let score = 0;
  el.querySelectorAll("p").forEach((p) => {
    score += (p.textContent ?? "").trim().length;
  });
  return score;
}

function selectMainContent(doc: Document): Element | null {
  const semantic = doc.querySelector("article") ?? doc.querySelector("main");
  if (semantic && contentScore(semantic) > 0) return semantic;

  let best: Element | null = null;
  let bestScore = 0;
  doc.querySelectorAll("div, section, article, main").forEach((candidate) => {
    const score = contentScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best ?? doc.body ?? null;
}

function stripSiteSuffix(title: string): string {
  const parts = title.split(/\s+[|—–-]\s+/u);
  return (parts[0] ?? title).trim();
}

function extractTitle(doc: Document, main: Element | null): string {
  const h1 = main?.querySelector("h1") ?? doc.querySelector("h1");
  if (h1?.textContent?.trim()) return h1.textContent.trim();
  const title = doc.querySelector("title")?.textContent?.trim();
  return title ? stripSiteSuffix(title) : "";
}

function extractByline(scope: Element | Document): string | null {
  const el =
    scope.querySelector("[rel=author]")
    ?? scope.querySelector("[itemprop=author]")
    ?? scope.querySelector(".byline, .author");
  const text = el?.textContent?.trim();
  return text || null;
}

/**
 * Read a page's HTML into a reader-mode Markdown view.
 * Never throws on malformed/empty input — returns an empty result instead.
 */
export function readPage(
  html: string,
  url: string,
  budget: CleanReaderBudget = DEFAULT_BUDGET,
): CleanReaderResult {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const byline = extractByline(doc);
  doc.querySelectorAll(NOISE).forEach((el) => el.remove());

  const main = selectMainContent(doc);
  const title = extractTitle(doc, main);
  let markdown = main ? toMarkdown(main, url) : "";
  const textLength = (main?.textContent ?? "").replace(/\s+/gu, " ").trim().length;
  const maxChars = Math.max(0, Math.floor(budget.maxMarkdownChars));
  let truncated = false;
  if (markdown.length > maxChars) {
    markdown = markdown.slice(0, maxChars);
    truncated = true;
  }
  return { title, byline, url, markdown, textLength, truncated };
}
