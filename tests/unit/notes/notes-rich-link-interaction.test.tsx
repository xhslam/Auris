import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import { describe, expect, it, vi } from "vitest";
import { NotesRichEditorPane } from "@/components/notes-v2/notes-rich-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesEditorBridge } from "@/features/notes/editor/editor-types";
import { EditorView } from "prosemirror-view";

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "note",
    fileName: "note.md",
    frontmatter: {},
    mtime: null,
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: null,
      wordCount: 0,
    },
    path: "note.md",
    rawSource,
  };
}

describe("rich Markdown hyperlink interactions", () => {
  it.each([
    ["Windows Control-click", { ctrlKey: true }],
    ["macOS Command-click", { metaKey: true }],
  ])("opens a linked target from %s and keeps ordinary editing clicks in the editor", async (_label, modifiers) => {
    const document = createDocument("[guide](https://example.com/guide)");
    const onOpenMarkdownLink = vi.fn();
    const onDocumentChange = vi.fn();
    const bridge: { current: NotesEditorBridge | null } = { current: null };
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onBridgeReady={(value) => { bridge.current = value; }}
        onDocumentChange={onDocumentChange}
        onOpenMarkdownLink={onOpenMarkdownLink}
      />,
    );

    const anchor = await waitFor(() => {
      const found = container.querySelector<HTMLAnchorElement>(".ProseMirror a[href]");
      expect(found).not.toBeNull();
      return found!;
    });
    const openClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...modifiers,
    });
    act(() => anchor.dispatchEvent(openClick));

    expect(openClick.defaultPrevented).toBe(true);
    expect(onOpenMarkdownLink).toHaveBeenCalledWith(
      "https://example.com/guide",
      "note.md",
    );

    const ordinaryClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => anchor.dispatchEvent(ordinaryClick));
    expect(ordinaryClick.defaultPrevented).toBe(true);
    expect(onOpenMarkdownLink).toHaveBeenCalledTimes(1);
    expect(bridge.current?.view).toBeTruthy();
  });

  it("edits a link target with Mod+K and preserves the link text", async () => {
    const document = createDocument('[guide](https://old.example/path "ref")');
    const onEditLink = vi.fn(async () => "https://new.example/path");
    const onDocumentChange = vi.fn();
    const bridge: { current: NotesEditorBridge | null } = { current: null };
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onBridgeReady={(value) => { bridge.current = value; }}
        onDocumentChange={onDocumentChange}
        onEditLink={onEditLink}
      />,
    );

    let view: EditorView | null = null;
    await waitFor(() => {
      expect(bridge.current?.view).toBeTruthy();
      view = bridge.current?.view as EditorView;
      expect(container.querySelector(".ProseMirror a[href]" )).not.toBeNull();
    });

    let linkTextPosition = -1;
    view!.state.doc.descendants((node, position) => {
      if (node.isText && node.text === "guide") linkTextPosition = position;
    });
    expect(linkTextPosition).toBeGreaterThanOrEqual(0);

    act(() => {
      view!.dispatch(
        view!.state.tr.setSelection(
          TextSelection.create(view!.state.doc, linkTextPosition),
        ),
      );
    });
    fireEvent.keyDown(view!.dom, { key: "k", ctrlKey: true });

    await waitFor(() =>
      expect(onDocumentChange).toHaveBeenCalledWith(
        '[guide](https://new.example/path "ref")',
      ),
    );
    expect(onEditLink).toHaveBeenCalledWith("https://old.example/path");
    expect(view!.state.doc.textContent).toBe("guide");
  });

  it("opens a linked image on modified click without losing its target mark", async () => {
    const document = createDocument("[![cover](cover.png)](chapter.md)");
    const onOpenMarkdownLink = vi.fn();
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onBridgeReady={() => undefined}
        onDocumentChange={() => undefined}
        onOpenMarkdownLink={onOpenMarkdownLink}
      />,
    );

    const image = await waitFor(() => {
      const found = container.querySelector<HTMLImageElement>(".ProseMirror a[href] img");
      expect(found).not.toBeNull();
      return found!;
    });
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    act(() => image.dispatchEvent(click));

    expect(click.defaultPrevented).toBe(true);
    expect(onOpenMarkdownLink).toHaveBeenCalledWith("chapter.md", "note.md");
  });

  it("uses the current note path after switching documents", async () => {
    const first = createDocument("[guide](chapter.md)");
    const second = { ...first, path: "folder/second.md" };
    const onOpenMarkdownLink = vi.fn();
    const props = {
      documents: [first, second],
      onDocumentChange: vi.fn(),
      onOpenMarkdownLink,
    };
    const { container, rerender } = render(
      <NotesRichEditorPane document={first} {...props} />,
    );

    await waitFor(() =>
      expect(container.querySelector(".ProseMirror a[href]")).not.toBeNull(),
    );
    rerender(<NotesRichEditorPane document={second} {...props} />);

    const anchor = await waitFor(() => {
      const found = container.querySelector<HTMLAnchorElement>(".ProseMirror a[href]");
      expect(found).not.toBeNull();
      return found!;
    });
    act(() =>
      anchor.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: true,
        }),
      ),
    );

    expect(onOpenMarkdownLink).toHaveBeenCalledWith("chapter.md", "folder/second.md");
  });
});
