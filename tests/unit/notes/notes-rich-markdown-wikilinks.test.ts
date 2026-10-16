import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { DecorationSet, EditorView } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  createWikiLinkDecorationPlugin,
  notesRichEditorSchema,
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

function collectWikiLinks(doc: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = [];

  doc.descendants((node) => {
    if (node.type.name === "wiki_link") {
      nodes.push(node);
    }
  });

  return nodes;
}

describe("notes rich markdown wiki links", () => {
  it("parses [[...]] into a wiki_link node carrying the inner token", () => {
    const doc = parseNotesRichMarkdown("See [[grammar]] today.");
    const links = collectWikiLinks(doc);

    expect(links).toHaveLength(1);
    expect(links[0].attrs.token).toBe("grammar");
    expect(links[0].attrs.target).toBe("grammar");
  });

  it("round-trips a wiki link with heading and alias back to markdown", () => {
    const source = "复习 [[语法卡片#Tenses|语法]]";
    const doc = parseNotesRichMarkdown(source);

    expect(collectWikiLinks(doc)[0].attrs.token).toBe("语法卡片#Tenses|语法");
    expect(serializeNotesRichMarkdown(doc)).toBe(source);
  });

  it("does not treat a single bracket pair as a wiki link", () => {
    const doc = parseNotesRichMarkdown("an [array] index");

    expect(collectWikiLinks(doc)).toHaveLength(0);
  });

  it("colours wiki_link nodes as exists/missing via the decoration plugin", () => {
    const plugin = createWikiLinkDecorationPlugin(
      (token) => token === "grammar",
    );
    const doc = parseNotesRichMarkdown("[[grammar]] 与 [[missing]]");
    const state = EditorState.create({
      doc,
      plugins: [plugin],
      schema: notesRichEditorSchema,
    });

    const decorationSet = plugin.props.decorations?.call(plugin, state);
    expect(decorationSet).toBeInstanceOf(DecorationSet);
    if (!(decorationSet instanceof DecorationSet)) throw new Error("Expected wiki-link decorations");
    const host = document.createElement("div");
    document.body.append(host);
    const view = new EditorView(host, { state });
    try {
      expect(host.querySelector(".notes-v2__wikilink--exists")).not.toBeNull();
      expect(host.querySelector(".notes-v2__wikilink--missing")).not.toBeNull();
    } finally {
      view.destroy();
      host.remove();
    }
  });
});
