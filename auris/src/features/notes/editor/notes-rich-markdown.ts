import MarkdownIt from "markdown-it";
import {
  DOMParser,
  type DOMOutputSpec,
  Fragment,
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
import {
  getWikiLinkLabel,
  parseWikiLinkTarget,
} from "@/features/notes/documents/wiki-link-navigation";
import { renderMathMarkup } from "@/features/notes/editor/code-block-preview";

// markdown-it plugin: tokenize `$$ ... $$` block math (vmark-style, mirrored
// from this codebase's existing remark-math/CodeMirror math handling) into a
// custom block token rendered as a <div data-math-block> element, which the
// ProseMirror DOMParser then maps onto the `math_block` node.
function mathBlockMarkdownPlugin(md: MarkdownIt) {
  md.block.ruler.before(
    "fence",
    "math_block",
    (state, startLine, endLine, silent) => {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];

      if (state.src.slice(startPos, startPos + 2) !== "$$") {
        return false;
      }

      const firstLineContent = state.src.slice(startPos + 2, max).trim();
      let endContentLine = -1;
      let singleLine = false;

      if (firstLineContent.endsWith("$$") && firstLineContent.length >= 2) {
        endContentLine = startLine;
        singleLine = true;
      } else {
        for (let nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineMax = state.eMarks[nextLine];

          if (state.src.slice(lineStart, lineMax).trim() === "$$") {
            endContentLine = nextLine;
            break;
          }
        }
      }

      if (endContentLine < 0) {
        return false;
      }

      if (silent) {
        return true;
      }

      const content = singleLine
        ? firstLineContent.slice(0, -2).trim()
        : state.getLines(startLine + 1, endContentLine, state.blkIndent, false).trim();

      const token = state.push("math_block", "", 0);
      token.content = content;
      token.map = [startLine, endContentLine + 1];
      state.line = endContentLine + 1;
      return true;
    },
    { alt: [] },
  );

  md.renderer.rules.math_block = (tokens, index) =>
    `<div data-math-block="${md.utils.escapeHtml(tokens[index].content)}"></div>\n`;
}

// markdown-it plugin: tokenize inline `$...$` math into a custom inline token
// rendered as a <span data-math-inline> element, mapped onto `math_inline`.
function mathInlineMarkdownPlugin(md: MarkdownIt) {
  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    const src = state.src;

    if (
      src.charCodeAt(start) !== 0x24 /* $ */ ||
      src.charCodeAt(start + 1) === 0x24
    ) {
      return false;
    }

    let pos = start + 1;
    let end = -1;

    while (pos < state.posMax) {
      const code = src.charCodeAt(pos);

      if (code === 0x24 && src.charCodeAt(pos - 1) !== 0x5c /* \ */) {
        end = pos;
        break;
      }

      if (code === 0x0a /* \n */) {
        return false;
      }

      pos += 1;
    }

    if (end < 0) {
      return false;
    }

    const content = src.slice(start + 1, end);

    if (!content.trim() || /^\s|\s$/.test(content)) {
      return false;
    }

    if (!silent) {
      const token = state.push("math_inline", "", 0);
      token.content = content;
    }

    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, index) =>
    `<span data-math-inline="${md.utils.escapeHtml(tokens[index].content)}"></span>`;
}

// markdown-it plugin: tokenize Obsidian-style `[[wiki links]]` into a custom
// inline token that renders as an <a data-wikilink-*> element, which the
// ProseMirror DOMParser then maps onto the `wiki_link` node.
function wikiLinkMarkdownPlugin(md: MarkdownIt) {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const start = state.pos;
    const src = state.src;

    if (
      src.charCodeAt(start) !== 0x5b /* [ */ ||
      src.charCodeAt(start + 1) !== 0x5b
    ) {
      return false;
    }

    const end = src.indexOf("]]", start + 2);

    if (end < 0) {
      return false;
    }

    const inner = src.slice(start + 2, end);

    if (!inner.trim() || inner.includes("[") || inner.includes("\n")) {
      return false;
    }

    if (!silent) {
      const token = state.push("wikilink", "", 0);
      token.content = inner;
    }

    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, index) => {
    const inner = tokens[index].content;
    const target = parseWikiLinkTarget(inner);
    const label = getWikiLinkLabel(inner);

    return `<a class="notes-v2__wikilink" data-wikilink-token="${md.utils.escapeHtml(
      inner,
    )}" data-wikilink-target="${md.utils.escapeHtml(target)}">${md.utils.escapeHtml(
      label,
    )}</a>`;
  };
}

// A standalone VMark [TOC] marker is parsed as an atom instead of prose.
function tableOfContentsMarkdownPlugin(md: MarkdownIt) {
  md.block.ruler.before("paragraph", "notes_toc", (state, startLine, _endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    if (state.src.slice(start, end).trim().toUpperCase() !== "[TOC]") return false;
    if (!silent) state.push("notes_toc", "nav", 0);
    state.line = startLine + 1;
    return true;
  });
  md.renderer.rules.notes_toc = () =>
    '<nav class="notes-v2__rich-toc" data-notes-toc="true"></nav>';
}
const markdownRenderer = MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})
  .enable("table")
  .use(wikiLinkMarkdownPlugin)
  .use(mathBlockMarkdownPlugin)
  .use(mathInlineMarkdownPlugin)
  .use(tableOfContentsMarkdownPlugin);

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

// Block atom node modelling a `$$ ... $$` math block. `source` holds the raw
// LaTeX so the node round-trips losslessly back to markdown; rendering reuses
// the same KaTeX helper as the CodeMirror/reading-mode math previews so the
// formula looks identical across all three editor modes.
const mathBlockNodeSpec: NodeSpec = {
  atom: true,
  attrs: {
    source: { default: "" },
  },
  group: "block",
  parseDOM: [
    {
      getAttrs(dom: HTMLElement) {
        return { source: dom.getAttribute("data-math-block") ?? "" };
      },
      tag: "div[data-math-block]",
    },
  ],
  selectable: true,
  toDOM(node: ProseMirrorNode): DOMOutputSpec {
    const source = node.attrs.source as string;
    const wrapper = document.createElement("div");
    wrapper.className = "notes-v2__math-block";
    wrapper.setAttribute("data-math-block", source);

    try {
      wrapper.innerHTML = renderMathMarkup(source, true);
    } catch {
      wrapper.textContent = source;
    }

    return wrapper;
  },
};

// Inline atom node modelling `$...$` math, mirroring `mathBlockNodeSpec`.
const mathInlineNodeSpec: NodeSpec = {
  atom: true,
  attrs: {
    source: { default: "" },
  },
  group: "inline",
  inline: true,
  parseDOM: [
    {
      getAttrs(dom: HTMLElement) {
        return { source: dom.getAttribute("data-math-inline") ?? "" };
      },
      tag: "span[data-math-inline]",
    },
  ],
  selectable: true,
  toDOM(node: ProseMirrorNode): DOMOutputSpec {
    const source = node.attrs.source as string;
    const wrapper = document.createElement("span");
    wrapper.className = "notes-v2__math-inline";
    wrapper.setAttribute("data-math-inline", source);

    try {
      wrapper.innerHTML = renderMathMarkup(source, false);
    } catch {
      wrapper.textContent = source;
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
          params: languageMatch?.[1] ?? "",
        };
      },
      preserveWhitespace: "full" as const,
      tag: "pre",
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const attrs = node.attrs.params
      ? {
          class: `language-${node.attrs.params}`,
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
const listNodes = addListNodes(baseNodes, "paragraph block*", "block");
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

export const notesRichEditorSchema = new Schema({
  marks: basicSchema.spec.marks,
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
      state.write(`$$\n${node.attrs.source as string}\n$$`);
      state.closeBlock(node);
    },
    math_inline(state, node) {
      state.write(`$${node.attrs.source as string}$`);
    },
    toc(state, node) {
      state.write("[TOC]");
      state.closeBlock(node);
    },
  },
  defaultMarkdownSerializer.marks,
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

export function parseNotesRichMarkdown(source: string) {
  if (!source.trim()) {
    return notesRichEditorSchema.topNodeType.createAndFill()!;
  }

  const container = document.createElement("div");
  container.innerHTML = markdownRenderer.render(source);
  return DOMParser.fromSchema(notesRichEditorSchema).parse(container);
}

export function serializeNotesRichMarkdown(doc: ProseMirrorNode) {
  const source = notesRichMarkdownSerializer.serialize(doc);
  return source.trimEnd();
}
