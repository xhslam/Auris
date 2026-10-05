import {
  DOMParser,
  type DOMOutputSpec,
  Fragment,
  Slice,
  type MarkSpec,
  type Node as ProseMirrorNode,
  type NodeSpec,
  Schema,
} from "prosemirror-model";
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import { addListNodes } from "prosemirror-schema-list";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { tableNodes } from "prosemirror-tables";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { createInertNotesHtmlContainer } from "./notes-inert-html";
import {
  getWikiLinkLabel,
  parseWikiLinkTarget,
} from "@/features/notes/documents/wiki-link-navigation";
import { renderMathMarkup } from "@/features/notes/editor/code-block-preview";
import {
  createNotesMarkdownProcessor,
  findNotesMathDelimiterSpans,
  normalizeNotesMathDelimiters,
} from "@/features/notes/markdown/notes-markdown-dialect";
import {
  assertNotesMarkdownNestingSafe,
  NotesMarkdownNestingError,
} from "@/features/notes/markdown/notes-markdown-nesting";

type HtmlAstNode = {
  children?: HtmlAstNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

function textContent(node: HtmlAstNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

function wikiLinkNodes(value: string): HtmlAstNode[] {
  const nodes: HtmlAstNode[] = [];
  const pattern = /\[\[([^\]\n]+)\]\]/gu;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const token = match[1];
    if (!token.trim() || token.includes("[")) continue;

    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    }

    nodes.push({
      children: [{ type: "text", value: getWikiLinkLabel(token) }],
      properties: {
        className: ["notes-v2__wikilink"],
        dataWikilinkTarget: parseWikiLinkTarget(token),
        dataWikilinkToken: token,
      },
      tagName: "a",
      type: "element",
    });
    cursor = index + match[0].length;
  }

  if (cursor === 0) return [{ type: "text", value }];
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

/** Preserve Auris semantic atoms while converting the shared MDAST to HTML. */
function rehypeRichEditorAtoms() {
  return (tree: HtmlAstNode) => {
    const transform = (parent: HtmlAstNode, opaque = false) => {
      if (!parent.children) return;

      const next: HtmlAstNode[] = [];
      for (const child of parent.children) {
        const childOpaque =
          opaque ||
          (child.type === "element" &&
            ["a", "code", "pre"].includes(child.tagName ?? ""));

        if (
          !childOpaque &&
          child.type === "element" &&
          child.tagName === "p" &&
          textContent(child).trim().toUpperCase() === "[TOC]"
        ) {
          next.push({
            children: [],
            properties: {
              className: ["notes-v2__rich-toc"],
              dataNotesToc: "true",
            },
            tagName: "nav",
            type: "element",
          });
          continue;
        }

        if (!childOpaque && child.type === "text" && child.value?.includes("[[")) {
          next.push(...wikiLinkNodes(child.value));
          continue;
        }

        transform(child, childOpaque);
        next.push(child);
      }
      parent.children = next;
    };

    transform(tree);
  };
}

function mathElement(tagName: "div" | "span", property: string, value: string) {
  return {
    children: [],
    properties: { [property]: value },
    tagName,
    type: "element" as const,
  };
}

/** Keep AST-only information through Auris's MDAST → HTML → ProseMirror bridge.
 * Reference: VMark markdownPipeline/parser/serializer, 2d3903cb2, ISC.
 */
function remarkRichEditorMetadata() {
  type MarkdownNode = {
    type: string;
    lang?: string | null;
    meta?: string | null;
    spread?: boolean;
    children?: MarkdownNode[];
    data?: { hProperties?: Record<string, unknown> };
  };
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === "code" || node.type === "list") {
        node.data ??= {};
        node.data.hProperties ??= {};
        if (node.type === "code") {
          node.data.hProperties.dataNotesCodeParams = [node.lang, node.meta].filter(Boolean).join(" ");
        } else {
          node.data.hProperties.dataNotesListTight = String(!node.spread && !node.children?.some(child => child.spread));
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const richMarkdownPipeline = createNotesMarkdownProcessor()
  .use(remarkRichEditorMetadata)
  .use(remarkRehype, {
    handlers: {
      // A paragraph-final/consecutive hard break requires inline HTML to
      // survive CommonMark. Other raw HTML keeps the existing import policy.
      html(_state, node) {
        if (/^<br\s*\/?\s*>$/iu.test(node.value)) {
          return { type: "element", tagName: "br", properties: {}, children: [] };
        }
      },
      inlineMath(_state, node) {
        return mathElement(
          "span",
          "dataMathInline",
          (node as { value?: string }).value ?? "",
        );
      },
      math(_state, node) {
        return mathElement(
          "div",
          "dataMathBlock",
          (node as { value?: string }).value ?? "",
        );
      },
    },
  })
  .use(rehypeRichEditorAtoms)
  .use(rehypeStringify)
  .freeze();

// Inline atom node modelling a `[[wiki link]]`. `token` holds the full inner
// text (e.g. `target#heading|alias`) so the link round-trips losslessly back
// to markdown; `target` is the navigation/resolution key.
const wikiLinkNodeSpec: NodeSpec = {
  atom: true,
  attrs: {
    target: { default: "" },
    token: { default: "" },
  },
  group: "inline",
  inline: true,
  parseDOM: [
    {
      getAttrs(dom: HTMLElement) {
        const token =
          dom.getAttribute("data-wikilink-token") ??
          dom.getAttribute("data-wikilink-target") ??
          dom.textContent ??
          "";

        return {
          target:
            dom.getAttribute("data-wikilink-target") ??
            parseWikiLinkTarget(token),
          token,
        };
      },
      tag: "a[data-wikilink-target]",
    },
  ],
  selectable: true,
  toDOM(node: ProseMirrorNode): DOMOutputSpec {
    const token = node.attrs.token as string;
    const target = (node.attrs.target as string) || parseWikiLinkTarget(token);

    return [
      "a",
      {
        class: "notes-v2__wikilink",
        "data-wikilink-target": target,
        "data-wikilink-token": token,
      },
      getWikiLinkLabel(token) || target,
    ];
  },
};

// Block atom node modelling a `$$ ... $$` math block. `content` holds the raw
// LaTeX so the node round-trips losslessly back to markdown; rendering reuses
// the same KaTeX helper as the CodeMirror/reading-mode math previews so the
// formula looks identical across all three editor modes.
const mathBlockNodeSpec: NodeSpec = {
  atom: true,
  attrs: {
    content: { default: "" },
  },
  group: "block",
  parseDOM: [
    {
      getAttrs(dom: HTMLElement) {
        return { content: dom.getAttribute("data-math-block") ?? "" };
      },
      tag: "div[data-math-block]",
    },
  ],
  selectable: true,
  toDOM(node: ProseMirrorNode): DOMOutputSpec {
    const content = node.attrs.content as string;
    const wrapper = document.createElement("div");
    wrapper.className = "notes-v2__math-block";
    wrapper.setAttribute("data-math-block", content);

    try {
      wrapper.innerHTML = renderMathMarkup(content, true);
    } catch {
      wrapper.textContent = content;
    }

    return wrapper;
  },
};

// Inline atom node modelling `$...$` math, mirroring `mathBlockNodeSpec`.
const mathInlineNodeSpec: NodeSpec = {
  atom: true,
  attrs: {
    content: { default: "" },
  },
  group: "inline",
  inline: true,
  parseDOM: [
    {
      getAttrs(dom: HTMLElement) {
        return { content: dom.getAttribute("data-math-inline") ?? "" };
      },
      tag: "span[data-math-inline]",
    },
  ],
  selectable: true,
  toDOM(node: ProseMirrorNode): DOMOutputSpec {
    const content = node.attrs.content as string;
    const wrapper = document.createElement("span");
    wrapper.className = "notes-v2__math-inline";
    wrapper.setAttribute("data-math-inline", content);

    try {
      wrapper.innerHTML = renderMathMarkup(content, false);
    } catch {
      wrapper.textContent = content;
    }

    return wrapper;
  },
};

const codeBlockNodeSpec: NodeSpec = {
  attrs: {
    params: {
      default: "",
    },
  },
  code: true,
  content: "text*",
  defining: true,
  group: "block",
  marks: "",
  parseDOM: [
    {
      getContent(dom: Node, schema: Schema) {
        const code = (dom as HTMLElement).querySelector("code");
        const source = (code?.textContent ?? dom.textContent ?? "").replace(
          /\n$/u,
          "",
        );

        return source ? Fragment.from(schema.text(source)) : Fragment.empty;
      },
      getAttrs(dom: HTMLElement) {
        const code = dom.querySelector("code");
        const className = code?.getAttribute("class") ?? "";
        const languageMatch = className.match(/(?:^|\s)language-([^\s]+)/);

        return {
          params: code?.getAttribute("data-notes-code-params") ?? languageMatch?.[1] ?? "",
        };
      },
      preserveWhitespace: "full" as const,
      tag: "pre",
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs = node.attrs.params
      ? {
          class: `language-${String(node.attrs.params).split(/\s/u)[0]}`,
          "data-notes-code-params": node.attrs.params,
        }
      : {};

    return [
      "pre",
      [
        "code",
        attrs,
        0,
      ],
    ];
  },
};

const baseNodes = basicSchema.spec.nodes.update("code_block", codeBlockNodeSpec);
const listNodes = ["bullet_list", "ordered_list"].reduce((nodes, name) => {
  const spec = nodes.get(name)!;
  const ordered = name === "ordered_list";
  return nodes.update(name, {
    ...spec,
    attrs: { ...spec.attrs, tight: { default: true } },
    parseDOM: [{
      tag: ordered ? "ol" : "ul",
      getAttrs(dom: HTMLElement) {
        return {
          ...(ordered ? { order: Number(dom.getAttribute("start") ?? 1) } : {}),
          tight: dom.hasAttribute("data-notes-list-tight")
            ? dom.getAttribute("data-notes-list-tight") === "true"
            : !Array.from(dom.children).some(child => Array.from(child.children).some(block => block.tagName === "P")),
        };
      },
    }],
    toDOM(node): DOMOutputSpec {
      return [ordered ? "ol" : "ul", {
        ...(ordered && node.attrs.order !== 1 ? { start: node.attrs.order } : {}),
        "data-notes-list-tight": String(node.attrs.tight),
      }, 0];
    },
  });
}, addListNodes(baseNodes, "paragraph block*", "block"));
// Block atom whose NodeView renders a live heading navigator.
const tableOfContentsNodeSpec: NodeSpec = {
  atom: true,
  group: "block",
  parseDOM: [{ tag: "nav[data-notes-toc]" }],
  selectable: true,
  toDOM(): DOMOutputSpec {
    return [
      "nav",
      {
        "aria-label": "文档目录",
        class: "notes-v2__rich-toc",
        "data-notes-toc": "true",
      },
    ];
  },
};
const richNodes = listNodes
  .append(
    tableNodes({
      cellContent: "block+",
      cellAttributes: {},
      tableGroup: "block",
    }),
  )
  .addToEnd("wiki_link", wikiLinkNodeSpec)
  .addToEnd("math_block", mathBlockNodeSpec)
  .addToEnd("math_inline", mathInlineNodeSpec)
  .addToEnd("toc", tableOfContentsNodeSpec);

export const strikethroughMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: "s" },
    { tag: "del" },
    { tag: "strike" },
    { style: "text-decoration=line-through" },
    { style: "text-decoration-line=line-through" },
  ],
  toDOM() {
    return ["s", 0];
  },
};

export const richMarks = basicSchema.spec.marks.addToEnd(
  "strikethrough",
  strikethroughMarkSpec,
);

export const notesRichEditorSchema = new Schema({
  marks: richMarks,
  nodes: richNodes,
});

function getCellMarkdown(cell: ProseMirrorNode) {
  const cellDocument = notesRichEditorSchema.topNodeType.create(
    null,
    cell.content,
  );

  return notesRichMarkdownSerializer
    .serialize(cellDocument)
    .replace(/\s*\n+\s*/gu, " ")
    .trim();
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|");
}

function renderMarkdownTableRow(cells: string[]) {
  return `| ${cells.map(escapeTableCell).join(" | ")} |`;
}

function renderMarkdownTableSeparator(columnCount: number) {
  return `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
}

function serializeTable(node: ProseMirrorNode) {
  const rows: string[][] = [];

  node.forEach((row) => {
    const cells: string[] = [];

    row.forEach((cell) => {
      cells.push(getCellMarkdown(cell));
    });

    rows.push(cells);
  });

  if (rows.length === 0) {
    return "";
  }

  const [headerRow, ...bodyRows] = rows;
  const separator = renderMarkdownTableSeparator(headerRow.length);
  const renderedRows = [
    renderMarkdownTableRow(headerRow),
    separator,
    ...bodyRows.map((row) => renderMarkdownTableRow(row)),
  ];

  return renderedRows.join("\n");
}

export const notesRichMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    hard_break(state, node, parent, index) {
      // Backslash at paragraph end is literal text; a blank line ends the
      // paragraph. Explicit br keeps both final and consecutive break nodes.
      if (index === parent.childCount - 1 || parent.child(index + 1).type === node.type) {
        state.write("<br>");
      } else {
        defaultMarkdownSerializer.nodes.hard_break(state, node, parent, index);
      }
    },
    table(nodeSerializerState, node) {
      nodeSerializerState.write(serializeTable(node));
      nodeSerializerState.closeBlock(node);
    },
    table_cell(state, node) {
      state.renderContent(node);
    },
    table_header(state, node) {
      state.renderContent(node);
    },
    table_row(state, node) {
      state.renderContent(node);
    },
    wiki_link(state, node) {
      const token = (node.attrs.token as string) || (node.attrs.target as string);
      state.write(`[[${token}]]`);
    },
    math_block(state, node) {
      const content = node.attrs.content as string;
      const longest = Math.max(1, ...content.split("\n").map(line => /^\s*(\$+)\s*$/u.exec(line)?.[1].length ?? 0));
      const fence = "$".repeat(longest + 1);
      state.write(`${fence}\n`);
      state.text(content, false);
      state.write("\n");
      state.write(fence);
      state.closeBlock(node);
    },
    math_inline(state, node) {
      const content = node.attrs.content as string;
      const longest = Math.max(0, ...(content.match(/\$+/gu) ?? []).map(run => run.length));
      const fence = "$".repeat(longest + 1);
      state.write(`${fence}${content}${fence}`);
    },
    toc(state, node) {
      state.write("[TOC]");
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    s: {
      close: "~~",
      expelEnclosingWhitespace: true,
      mixable: true,
      open: "~~",
    },
    strikethrough: {
      close: "~~",
      expelEnclosingWhitespace: true,
      mixable: true,
      open: "~~",
    },
  },
  {
    strict: false,
  },
);

/**
 * ProseMirror plugin that colours `wiki_link` nodes as resolved (existing) or
 * unresolved (missing) by consulting `resolveExists`. Decorations recompute on
 * every transaction, so dispatch an empty transaction after the vault's
 * documents change to refresh the colours.
 */
export function createWikiLinkDecorationPlugin(
  resolveExists: (token: string) => boolean,
) {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];

        state.doc.descendants((node, pos) => {
          if (node.type.name !== "wiki_link") {
            return;
          }

          const exists = resolveExists(
            (node.attrs.token as string) || (node.attrs.target as string),
          );

          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: exists
                ? "notes-v2__wikilink--exists"
                : "notes-v2__wikilink--missing",
            }),
          );
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function parsePastedMathInTextRun(
  textNodes: ProseMirrorNode[],
  schema: Schema,
) {
  const source = textNodes.map((node) => node.text ?? "").join("");
  const spans = findNotesMathDelimiterSpans(source);

  if (spans.length === 0 || !schema.nodes.math_inline) return null;

  const segments: Array<{
    from: number;
    node: ProseMirrorNode;
    to: number;
  }> = [];
  let sourceOffset = 0;
  for (const node of textNodes) {
    const text = node.text ?? "";
    segments.push({ from: sourceOffset, node, to: sourceOffset + text.length });
    sourceOffset += text.length;
  }

  const result: ProseMirrorNode[] = [];
  const appendText = (from: number, to: number) => {
    for (const segment of segments) {
      const partFrom = Math.max(from, segment.from);
      const partTo = Math.min(to, segment.to);
      if (partFrom >= partTo) continue;
      result.push(
        schema.text(
          source.slice(partFrom, partTo),
          segment.node.marks,
        ),
      );
    }
  };
  const marksAt = (position: number) =>
    segments.find((segment) => position < segment.to)?.node.marks ?? [];

  let cursor = 0;
  for (const span of spans) {
    appendText(cursor, span.start);
    result.push(
      schema.nodes[span.kind === "display" ? "math_block" : "math_inline"].create(
        { content: span.content },
        null,
        span.kind === "inline" ? marksAt(span.start) : [],
      ),
    );
    cursor = span.end;
  }
  appendText(cursor, source.length);

  return result;
}

function transformPastedMathFragment(
  fragment: Fragment,
  schema: Schema,
): Fragment {
  let changed = false;
  const nodes: ProseMirrorNode[] = [];

  for (let index = 0; index < fragment.childCount;) {
    const child = fragment.child(index);
    const isMathEligibleText =
      child.isText && !child.marks.some((mark) => mark.type.name === "code");

    if (isMathEligibleText) {
      const textNodes: ProseMirrorNode[] = [];
      while (index < fragment.childCount) {
        const next = fragment.child(index);
        if (
          !next.isText ||
          next.marks.some((mark) => mark.type.name === "code")
        ) {
          break;
        }
        textNodes.push(next);
        index += 1;
      }

      const parsed = parsePastedMathInTextRun(textNodes, schema);
      if (parsed) {
        nodes.push(...parsed);
        changed = true;
      } else {
        nodes.push(...textNodes);
      }
      continue;
    }

    const transformed = child.isLeaf ? [child] : transformPastedMathNode(child, schema);
    nodes.push(...transformed);
    changed ||= transformed.length !== 1 || transformed[0] !== child;
    index += 1;
  }

  return changed ? Fragment.fromArray(nodes) : fragment;
}

function transformPastedMathNode(
  node: ProseMirrorNode,
  schema: Schema,
): ProseMirrorNode[] {
  if (node.isLeaf || node.type.spec.code) return [node];
  const content = transformPastedMathFragment(node.content, schema);
  if (content === node.content) return [node];
  if (!node.isTextblock) return [node.copy(content)];
  const blocks: ProseMirrorNode[] = [];
  let inline: ProseMirrorNode[] = [];
  const flush = () => {
    if (inline.length) blocks.push(node.copy(Fragment.fromArray(inline)));
    inline = [];
  };
  content.forEach(child => {
    if (child.type.name === "math_block") { flush(); blocks.push(child); }
    else inline.push(child);
  });
  flush();
  return blocks;
}

/** Import formula atoms before pasted prose can acquire Markdown escapes. */
export function createNotesRichMathPastePlugin(schema: Schema) {
  return new Plugin({
    props: {
      clipboardTextParser(text, $context) {
        // Pasting inside code must remain literal. For plain Markdown paste,
        // import the entire structure rather than serializing TeX as prose.
        try {
          if ($context.parent.type.spec.code || text.length > NOTES_RICH_PARSER_LIMITS.maxCharacters) return null as unknown as Slice;
          assertNotesMarkdownNestingSafe(text);
          if (!findNotesMathDelimiterSpans(text).length) return null as unknown as Slice;
          return Slice.maxOpen(parseNotesRichMarkdown(text, { throwOnRefusal: true }).content);
        } catch {
          return null as unknown as Slice;
        }
      },
      transformPasted(slice) {
        const content = transformPastedMathFragment(slice.content, schema);
        if (content === slice.content) return slice;
        const maxOpen = Slice.maxOpen(content);
        return new Slice(content, Math.min(slice.openStart, maxOpen.openStart), Math.min(slice.openEnd, maxOpen.openEnd));
      },
    },
  });
}

export const NOTES_RICH_PARSER_LIMITS = {
  maxCharacters: 500_000,
  maxLines: 15_000,
} as const;

export class NotesMarkdownRefusalError extends Error {
  readonly code: "EXCEEDS_LIMITS" | "EXCEEDS_NESTING" | "PARSE_ERROR";
  constructor(message: string, code: "EXCEEDS_LIMITS" | "EXCEEDS_NESTING" | "PARSE_ERROR") {
    super(message);
    this.name = "NotesMarkdownRefusalError";
    this.code = code;
  }
}

export type ParseNotesRichMarkdownOptions = {
  throwOnRefusal?: boolean;
};

/**
 * Creates a safe fallback ProseMirror document containing the raw text
 * structured as plain paragraphs, ensuring zero data loss and preventing editor crashes.
 */
export function createSafeFallbackDoc(source: string): ProseMirrorNode {
  const lines = source.split(/\r?\n/);
  const paragraphs: ProseMirrorNode[] = [];

  for (const line of lines) {
    if (!line) {
      const emptyParagraph = notesRichEditorSchema.nodes.paragraph.create();
      if (emptyParagraph) paragraphs.push(emptyParagraph);
      continue;
    }
    const textNode = notesRichEditorSchema.text(line);
    const paragraph = notesRichEditorSchema.nodes.paragraph.create(null, textNode);
    if (paragraph) paragraphs.push(paragraph);
  }

  if (paragraphs.length === 0) {
    return notesRichEditorSchema.topNodeType.createAndFill()!;
  }

  return notesRichEditorSchema.topNodeType.create(null, paragraphs);
}

export function parseNotesRichMarkdown(
  source: string,
  options?: ParseNotesRichMarkdownOptions,
): ProseMirrorNode {
  if (!source.trim()) {
    return notesRichEditorSchema.topNodeType.createAndFill()!;
  }

  // Refusal & guard: If source exceeds safe limits, avoid parser freeze / ReDoS
  if (source.length > NOTES_RICH_PARSER_LIMITS.maxCharacters) {
    if (options?.throwOnRefusal) {
      throw new NotesMarkdownRefusalError(
        `Source length (${source.length}) exceeds safe limit (${NOTES_RICH_PARSER_LIMITS.maxCharacters}).`,
        "EXCEEDS_LIMITS",
      );
    }
    console.warn(
      `[parseNotesRichMarkdown] Refusal: source length (${source.length}) exceeds safe limit (${NOTES_RICH_PARSER_LIMITS.maxCharacters}). Using safe fallback.`,
    );
    return createSafeFallbackDoc(source);
  }

  try {
    assertNotesMarkdownNestingSafe(source);
    const container = createInertNotesHtmlContainer(String(
      richMarkdownPipeline.processSync(normalizeNotesMathDelimiters(source)),
    ));
    return DOMParser.fromSchema(notesRichEditorSchema).parse(container);
  } catch (error) {
    if (options?.throwOnRefusal) {
      throw new NotesMarkdownRefusalError(
        error instanceof Error ? error.message : String(error),
        error instanceof NotesMarkdownNestingError ? "EXCEEDS_NESTING" : "PARSE_ERROR",
      );
    }
    console.warn(
      "[parseNotesRichMarkdown] Parser error caught, safely falling back to raw document:",
      error,
    );
    return createSafeFallbackDoc(source);
  }
}

export function serializeNotesRichMarkdown(doc: ProseMirrorNode) {
  const source = notesRichMarkdownSerializer.serialize(doc);
  return source.trimEnd();
}
