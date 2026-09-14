/**
 * remark-renderer.ts
 *
 * Unified / remark pipeline for the Notes reading pane.
 *
 * Supported:
 *  - GFM: tables, strikethrough, task lists, autolinks
 *  - Display math ($$) and inline math ($) via KaTeX
 *  - YAML front matter (stripped, not rendered)
 *  - Obsidian-style callouts  > [!type] Title
 *  - Wiki-links [[target]] / [[target|label]]  (post-processed to <a> tags)
 *
 * The pipeline is frozen once per module load and reused for every render.
 */

import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import {
  createNotesMarkdownProcessor,
  normalizeNotesMathDelimiters,
} from "@/features/notes/markdown/notes-markdown-dialect";
import {
  getWikiLinkLabel,
  parseWikiLinkTarget,
} from "@/features/notes/documents/wiki-links";
import { DEFAULT_KATEX_MACROS } from "@/features/notes/editor/code-block-preview";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCalloutTone(raw: string): string {
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(" ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getNodeText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const record = node as {
    children?: unknown[];
    type?: string;
    value?: unknown;
  };

  if (record.type === "text") {
    return typeof record.value === "string" ? record.value : "";
  }

  return (record.children ?? []).map(getNodeText).join("");
}

function slugifyHeading(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{Letter}\p{Number}\s_-]+/gu, "")
      .replace(/\s+/g, "-") || "heading"
  );
}

function isTocPlaceholder(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as {
    tagName?: string;
    type?: string;
  };

  return (
    record.type === "element" &&
    record.tagName === "p" &&
    getNodeText(node).trim().toUpperCase() === "[TOC]"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom rehype plugin: Obsidian callouts → <aside data-callout="type">
//
// remark produces:
//   <blockquote><p>[!NOTE] Title\nbody…</p></blockquote>
//
// This plugin transforms it to:
//   <aside class="notes-v2__reading-callout" data-callout="note">
//     <div class="notes-v2__reading-callout-title">Title</div>
//     <p>body…</p>
//   </aside>
// ─────────────────────────────────────────────────────────────────────────────

function rehypeCallouts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "blockquote") return;

      // Find the first <p> child
      const firstPara = node.children?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c.type === "element" && c.tagName === "p",
      );
      if (!firstPara) return;

      // The callout marker lives in the first text node of that <p>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstText = firstPara.children?.find((c: any) => c.type === "text");
      if (!firstText) return;

      const calloutMatch = /^\[!([^\]]+)\][ \t]*(.*)/.exec(
        firstText.value as string,
      );
      if (!calloutMatch) return;

      const rawType = calloutMatch[1].trim();
      const tone = rawType.toLowerCase();
      const restOfFirstLine = calloutMatch[2];

      // Split on the first newline to separate title line from body text
      const newlinePos = (firstText.value as string).indexOf("\n");
      const titleText =
        restOfFirstLine.trim() || formatCalloutTone(rawType);
      const bodyText =
        newlinePos !== -1
          ? (firstText.value as string).slice(newlinePos + 1)
          : "";

      // Rebuild the first paragraph's children
      if (bodyText.trim()) {
        firstText.value = bodyText;
      } else {
        // Remove the now-empty first paragraph entirely
        node.children = node.children.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => c !== firstPara,
        );
      }

      // Prepend the title <div>
      const titleEl = {
        type: "element",
        tagName: "div",
        properties: { className: ["notes-v2__reading-callout-title"] },
        children: [{ type: "text", value: titleText }],
      };

      node.tagName = "aside";
      node.properties = {
        className: ["notes-v2__reading-callout"],
        dataCallout: tone,
      };
      node.children = [titleEl, ...node.children];
    });
  };
}

function rehypeHeadingAnchorsAndToc() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    const headings: Array<{ depth: number; id: string; text: string }> = [];
    const slugCounts = new Map<string, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "element", (node: any) => {
      const headingMatch = /^h([1-6])$/.exec(node.tagName ?? "");

      if (!headingMatch) {
        return;
      }

      const text = getNodeText(node);
      const baseSlug = slugifyHeading(text);
      const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
      slugCounts.set(baseSlug, nextCount);

      const id = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;

      node.properties = {
        ...(node.properties ?? {}),
        id,
      };
      headings.push({
        depth: Number(headingMatch[1]),
        id,
        text,
      });
    });

    if (headings.length === 0) {
      return;
    }

    const toc = {
      type: "element",
      tagName: "nav",
      properties: {
        ariaLabel: "Table of contents",
        className: ["notes-v2__reading-toc"],
      },
      children: [
        {
          type: "element",
          tagName: "ol",
          properties: {},
          children: headings.map((heading) => ({
            type: "element",
            tagName: "li",
            properties: {
              className: [`notes-v2__reading-toc-depth-${heading.depth}`],
            },
            children: [
              {
                type: "element",
                tagName: "a",
                properties: {
                  href: `#${heading.id}`,
                },
                children: [{ type: "text", value: heading.text }],
              },
            ],
          })),
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, (node: any) => {
      if (!Array.isArray(node.children)) {
        return;
      }

      node.children = node.children.map((child: unknown) =>
        isTocPlaceholder(child) ? toc : child,
      );
    });
  };
}

function rehypeSoftLineBreaks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "p" || !Array.isArray(node.children)) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextChildren: any[] = [];

      for (const child of node.children) {
        if (child?.type !== "text" || typeof child.value !== "string") {
          nextChildren.push(child);
          continue;
        }

        const parts = child.value.split("\n");

        parts.forEach((part: string, index: number) => {
          if (index > 0) {
            nextChildren.push({
              type: "element",
              tagName: "br",
              properties: {},
              children: [],
            });
          }

          if (part) {
            nextChildren.push({
              ...child,
              value: part,
            });
          }
        });
      }

      node.children = nextChildren;
    });
  };
}

function rehypeReadingMathClasses() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, "element", (node: any) => {
      const className = node.properties?.className;
      const classes = Array.isArray(className)
        ? className
        : typeof className === "string"
          ? className.split(/\s+/)
          : [];

      if (!classes.includes("katex-display")) {
        return;
      }

      node.properties = {
        ...(node.properties ?? {}),
        className: [...classes, "notes-v2__reading-math"],
      };
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Frozen pipeline — built once, reused for every renderMarkdown() call
// ─────────────────────────────────────────────────────────────────────────────

const pipeline = createNotesMarkdownProcessor()
  .use(remarkRehype)
  .use(rehypeKatex, {
    strict: false,
    throwOnError: false,
    macros: DEFAULT_KATEX_MACROS,
  })
  .use(rehypeHeadingAnchorsAndToc)
  .use(rehypeCallouts)
  .use(rehypeSoftLineBreaks)
  .use(rehypeReadingMathClasses)
  .use(rehypeStringify)
  .freeze();

// ─────────────────────────────────────────────────────────────────────────────
// Wiki-link post-processing
//
// [[target]] / [[target|label]] survive remark as literal text, so we replace
// them in the final HTML string.  Targets are URI-encoded for the href/data-*
// attribute; display labels are HTML-escaped.
// ─────────────────────────────────────────────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;

function postProcessWikiLinks(
  html: string,
  wikiLinkExists?: (target: string) => boolean,
  wikiLinkClickable = true,
): string {
  return html.replace(WIKILINK_RE, (_, rawTarget, rawLabel) => {
    const target = parseWikiLinkTarget(rawTarget);
    const displayLabel = escapeHtml(
      rawLabel?.trim() || getWikiLinkLabel(rawTarget),
    );
    const encodedTarget = encodeURIComponent(target);
    const exists = wikiLinkExists?.(target) ?? false;
    const stateCls = exists
      ? "notes-v2__reading-wikilink--exists"
      : "notes-v2__reading-wikilink--missing";

    if (!wikiLinkClickable) {
      return `<span class="notes-v2__reading-wikilink ${stateCls}">${displayLabel}</span>`;
    }

    return (
      `<a class="notes-v2__reading-wikilink ${stateCls} notes-v2__reading-wikilink--clickable"` +
      ` data-wikilink-target="${encodedTarget}"` +
      ` href="#wikilink-${encodedTarget}">${displayLabel}</a>`
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type RemarkRenderOptions = {
  /** Called for each wiki-link target to determine exists/missing styling. */
  wikiLinkExists?: (target: string) => boolean;
  /** Whether wiki links should render as navigable anchors. */
  wikiLinkClickable?: boolean;
};

/**
 * Render a Markdown source string to an HTML string.
 * Safe to call synchronously; the pipeline is pre-built.
 */
export function renderMarkdown(
  source: string,
  options?: RemarkRenderOptions,
): string {
  const rawHtml = String(
    pipeline.processSync(normalizeNotesMathDelimiters(source)),
  );
  return postProcessWikiLinks(
    rawHtml,
    options?.wikiLinkExists,
    options?.wikiLinkClickable,
  );
}
