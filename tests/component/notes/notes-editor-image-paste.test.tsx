import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { EditorView } from "@codemirror/view";
import type { EditorView as RichView } from "prosemirror-view";
import { undo } from "prosemirror-history";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function richView() {
  return (screen.getByTestId("notes-prosemirror-host") as HTMLDivElement & { __notesRichEditorView: RichView }).__notesRichEditorView;
}
function imageFile(name = "photo.png") {
  return new File(["png"], name, { type: "image/png" });
}


type NotesEditorHostElement = HTMLDivElement & {
  __notesEditorView?: EditorView;
};

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "daily-review",
    fileName: "daily-review.md",
    frontmatter: {},
    mtime: "2026-04-20T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Daily Review",
      wordCount: 1,
    },
    path: "notes/daily-review.md",
    rawSource,
  };
}

describe("NotesEditorPane image paste", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("has no image insertion button or file picker", () => {
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "插入图片" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("选择图片文件")).not.toBeInTheDocument();
  });

  it("persists and inserts pasted images in the default rich editor", async () => {
    const saveFile = vi.fn(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    const onDocumentChange = vi.fn();
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={onDocumentChange} />);
    fireEvent.paste(screen.getByTestId("notes-prosemirror-host").querySelector(".ProseMirror")!, {
      clipboardData: { files: [new File(["png"], "photo.png", { type: "image/png" })], getData: () => "" },
    });
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    await waitFor(() => expect(onDocumentChange).toHaveBeenCalledWith(expect.stringMatching(/!\[photo\]\(assets\/daily-review-photo-[\w-]+\.png\)/)));
  });

  it("pastes multiple images as separate paragraphs and undoes the batch together", async () => {
    const saveFile = vi.fn(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    fireEvent.paste(richView().dom, { clipboardData: { files: [imageFile("one.png"), imageFile("two.png")], getData: () => "" } });
    await waitFor(() => expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(2));
    expect(saveFile).toHaveBeenCalledTimes(2);
    expect(richView().state.doc.child(0).firstChild?.type.name).toBe("image");
    expect(richView().state.doc.child(1).firstChild?.type.name).toBe("image");
    expect(Array.from(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)"), image => image.getAttribute("alt"))).toEqual(["one", "two"]);
    act(() => { undo(richView().state, richView().dispatch); });
    expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(0);
    expect(richView().state.doc.textContent).toBe("Paragraph");
  });

  it("inserts a dropped file at the drop position", async () => {
    const saveFile = vi.fn(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    vi.spyOn(richView(), "posAtCoords").mockReturnValue({ pos: 10, inside: 0 });
    fireEvent.drop(richView().dom, { dataTransfer: { files: [imageFile()] }, clientX: 10, clientY: 10 });
    await waitFor(() => expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(1));
    expect(richView().state.doc.childCount).toBe(2);
    expect(richView().state.doc.firstChild?.textContent).toBe("Paragraph");
    expect(richView().state.doc.lastChild?.firstChild?.type.name).toBe("image");
  });

  it("drops into the chosen paragraph rather than the current caret and preserves surrounding text", async () => {
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile: vi.fn(async () => undefined) } });
    const onDocumentChange = vi.fn();
    render(<NotesEditorPane document={createDocument("Before\n\nTarget line\n\nAfter")} documents={[]} onDocumentChange={onDocumentChange} />);
    // Current caret is at the beginning; the actual drop is after 'Target'.
    vi.spyOn(richView(), "posAtCoords").mockReturnValue({ pos: 15, inside: 8 });
    fireEvent.drop(richView().dom, { dataTransfer: { files: [imageFile()] }, clientX: 10, clientY: 10 });
    await waitFor(() => expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(1));
    const blocks: string[] = [];
    richView().state.doc.forEach(node => blocks.push(node.firstChild?.type.name === "image" ? "IMAGE" : node.textContent));
    expect(blocks).toEqual(["Before", "Target", "IMAGE", " line", "After"]);
    await waitFor(() => expect(onDocumentChange).toHaveBeenCalledWith(expect.stringMatching(/Target\n\n!\[photo\].*\n\n line/)));
  });

  it("accepts clipboard file items when the files list is empty", async () => {
    const saveFile = vi.fn(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    fireEvent.paste(richView().dom, { clipboardData: { files: [], items: [{ kind: "file", getAsFile: () => imageFile() }], getData: () => "" } });
    await waitFor(() => expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(1));
  });

  it("reports save failures without inserting broken references", async () => {
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile: vi.fn(async () => { throw new Error("磁盘已满"); }) } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    fireEvent.paste(richView().dom, { clipboardData: { files: [imageFile()], getData: () => "" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("磁盘已满"));
    expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(0);
    expect(richView().state.doc.textContent).toBe("Paragraph");
  });

  it("never inserts a pending image into a newly opened note", async () => {
    let finish!: () => void;
    const saveFile = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    const { rerender } = render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    fireEvent.paste(richView().dom, { clipboardData: { files: [imageFile()], getData: () => "" } });
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    rerender(<NotesEditorPane document={{ ...createDocument("Other note"), path: "notes/other.md" }} documents={[]} onDocumentChange={vi.fn()} />);
    await act(async () => { finish(); });
    expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(0);
    expect(richView().state.doc.textContent).toBe("Other note");
  });

  it("preserves typing that occurs while an image is being saved", async () => {
    let finish!: () => void;
    const saveFile = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} />);
    fireEvent.paste(richView().dom, { clipboardData: { files: [imageFile()], getData: () => "" } });
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    act(() => richView().dispatch(richView().state.tr.insertText("New ", 1)));
    await act(async () => { finish(); });
    expect(richView().state.doc.textContent).toBe("New Paragraph");
    expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("发生变化"));
  });

  it("blocks rich image insertion in read-only mode", async () => {
    const saveFile = vi.fn(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    render(<NotesEditorPane document={createDocument("Paragraph")} documents={[]} onDocumentChange={vi.fn()} viewPreferences={{ focusMode: false, fontSize: 18, readOnly: true, typewriterMode: false }} />);
    expect(screen.queryByRole("button", { name: "插入图片" })).not.toBeInTheDocument();
    fireEvent.paste(richView().dom, { clipboardData: { files: [imageFile()], getData: () => "" } });
    await Promise.resolve();
    expect(saveFile).not.toHaveBeenCalled();
    expect(richView().dom.querySelectorAll("img:not(.ProseMirror-separator)")).toHaveLength(0);
  });

  it("does not persist or insert pasted images while read-only", async () => {
    const saveFile = vi.fn<(path: string, content: Uint8Array) => Promise<void>>(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });
    const onDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={createDocument("Paragraph")}
        documents={[createDocument("Paragraph")]}
        editorMode="source"
        onDocumentChange={onDocumentChange}
        viewPreferences={{
          focusMode: false,
          fontSize: 18,
          readOnly: true,
          typewriterMode: false,
        }}
      />,
    );

    const host = screen.getByTestId("notes-codemirror-host");
    const editor = host.querySelector(".cm-content") ?? host;
    fireEvent.paste(editor, {
      clipboardData: {
        files: [new File([new Uint8Array([1, 2, 3])], "blocked.png", {
          type: "image/png",
        })],
      },
    });

    await Promise.resolve();
    expect(saveFile).not.toHaveBeenCalled();
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("saves pasted image files into the note assets folder and inserts a markdown image line", async () => {
    const saveFile = vi.fn<(path: string, content: Uint8Array) => Promise<void>>(async () => undefined);
    vi.stubGlobal("shadowingDesktop", { vault: { saveFile } });

    const onDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={createDocument("Paragraph")}
        documents={[createDocument("Paragraph")]}
        editorMode="source"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId("notes-codemirror-host");
    const view = (host as NotesEditorHostElement).__notesEditorView;

    act(() => {
      view?.dispatch({
        selection: {
          anchor: view.state.doc.length,
        },
      });
    });

    const editor = host.querySelector(".cm-content") ?? host;
    const file = new File([new Uint8Array([1, 2, 3])], "Cover Photo.PNG", {
      type: "image/png",
    });

    fireEvent.paste(editor, {
      clipboardData: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalled();
    });

    expect(saveFile.mock.calls[0]?.[0]).toMatch(
      /^notes\/assets\/daily-review-cover-photo-[\w-]+\.png$/,
    );
    expect(saveFile.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.stringMatching(
          /Paragraph[\s\S]*!\[Cover Photo\]\(assets\/daily-review-cover-photo-[\w-]+\.png\)/,
        ),
      );
    });
  });
});
