import { act, render, screen } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import {
  createNotesMixedRendering,
  shouldSuspendMixedRendering,
  notesMixedRendering,
} from "@/features/notes/editor/editor-mixed-rendering";
import type { NoteDocument } from "@/features/notes/documents/document-types";

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
      headings: [
        {
          depth: 1,
          line: 0,
          slug: "daily-review",
          text: "Daily Review",
        },
      ],
      links: [],
      tags: ["shadowing"],
      tasks: [],
      title: "Daily Review",
      wordCount: 9,
    },
    path: "notes/daily-review.md",
    rawSource,
  };
}

describe("notes mixed rendering", () => {
  it("uses the shared dollar/export dialect and protects code in mixed preview", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const doc = ["Paragraph", String.raw`公式 \\$$G\\\_c = \\\\frac{1}{s}\\\\$$，行内 $K$`, "`$K$` costs $100 and $200"].join("\n");
    const view = new EditorView({ parent: host, state: EditorState.create({ doc, extensions: [notesMixedRendering] }) });
    expect(host.querySelectorAll(".notes-v2__cm-inline-math-preview")).toHaveLength(2);
    expect(host.querySelector(".katex-error")).toBeNull();
    expect(host.querySelector(".notes-v2__cm-inline-math-preview--display")).not.toBeNull();
    view.destroy();
    host.remove();
  });
  it("keeps the extracted title and every body Markdown marker visible in source mode", () => {
    const { container } = render(
      <NotesEditorPane
        document={createDocument("# Daily Review\n\nShadow the line\n## Keep breathing steady\n- List item\n> Quote line")}
        documents={[
          createDocument(
            "# Daily Review\n\nShadow the line\n## Keep breathing steady\n- List item\n> Quote line",
          ),
        ]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    const codeMirrorLines = Array.from(
      container.querySelectorAll(".cm-line"),
    ).map((line) => line.textContent?.trim() ?? "");

    expect(screen.getByRole("textbox", { name: "Note title" })).toHaveValue("Daily Review");
    expect(codeMirrorLines).toContain("## Keep breathing steady");
    expect(codeMirrorLines).toContain("- List item");
    expect(codeMirrorLines).toContain("> Quote line");
    expect(container.querySelector(".notes-v2__mixed-line")).toBeNull();
    expect(container.querySelector(".notes-v2__cm-widget")).toBeNull();
  });

  it("does not change heading source text when the cursor moves", () => {
    const { container } = render(
      <NotesEditorPane
        document={createDocument("# Daily Review\nParagraph one\n## Paragraph two")}
        documents={[
          createDocument("# Daily Review\nParagraph one\n## Paragraph two"),
        ]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    const host = screen.getByTestId(
      "notes-codemirror-host",
    ) as NotesEditorHostElement;
    const view = host.__notesEditorView;

    expect(view).toBeDefined();
    expect(container.querySelectorAll(".cm-line")[1]?.textContent).toContain(
      "## Paragraph two",
    );

    act(() => {
      view?.dispatch({
        selection: {
          anchor: view!.state.doc.line(2).from,
        },
      });
    });

    expect(container.querySelector(".cm-activeLine")?.textContent).toContain(
      "## Paragraph two",
    );
  });

  it("suspends mixed rendering while IME composition is active", () => {
    expect(
      shouldSuspendMixedRendering({
        composing: true,
        compositionStarted: false,
      }),
    ).toBe(true);

    expect(
      shouldSuspendMixedRendering({
        composing: false,
        compositionStarted: true,
      }),
    ).toBe(true);

    expect(
      shouldSuspendMixedRendering({
        composing: false,
        compositionStarted: false,
      }),
    ).toBe(false);
  });

  it("renders inactive mermaid code blocks as preview widgets", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "", "```mermaid", "graph TD;", "A-->B", "```"].join("\n"),
        extensions: [notesMixedRendering],
      }),
    });

    expect(
      host.querySelector(".notes-v2__cm-code-block-preview"),
    ).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders standalone markdown image lines as preview widgets", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "![Cover](images/cover.png)"].join("\n"),
        extensions: [
          createNotesMixedRendering({
            resolveImageUrl(source) {
              return `shadowing-media://vault/${source}`;
            },
          }),
        ],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-image-preview")).not.toBeNull();
    expect(
      host.querySelector(".notes-v2__cm-image-preview img")?.getAttribute("src"),
    ).toContain("shadowing-media://vault/");

    view.destroy();
    host.remove();
  });

  it("renders display math blocks as KaTeX preview widgets", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "", "$$", "x^2", "$$"].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-math-preview")).not.toBeNull();
    expect(host.querySelector(".notes-v2__cm-math-preview .katex")).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders compatible bracket display math as a KaTeX preview widget", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "", "\\[", "\\int_0^1 x\\,dx", "\\]"].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-math-preview .katex")).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders a bracket display formula after prose in mixed mode", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", String.raw`核心公式为： \[\mathbf{Z = P - 2N}\]`].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-inline-math-preview--display .katex-display")).not.toBeNull();
    expect(host.textContent).not.toContain(String.raw`\[\mathbf{Z = P - 2N}\]`);

    view.destroy();
    host.remove();
  });

  it("renders triple-escaped display delimiters from a saved note in mixed mode", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", String.raw`# 公式： \\\[\\mathbf{Z = P - 2N}\\\]`].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-inline-math-preview--display .katex-display")).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders NotebookLM's double-escaped bracket display math", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "", "\\\\[", "\\int_0^1 x\\,dx", "\\\\]"].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-math-preview .katex")).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders inline math spans as KaTeX preview widgets", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "Inline $E=mc^2$ math"].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelector(".notes-v2__cm-inline-math-preview")).not.toBeNull();
    expect(
      host.querySelector(".notes-v2__cm-inline-math-preview .katex"),
    ).not.toBeNull();

    view.destroy();
    host.remove();
  });

  it("renders compatible parenthesized inline math outside code spans", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: String.raw`Paragraph
Inline \(E=mc^2\) but code \`\(x^2\)\``.replaceAll("\\`", "`"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelectorAll(".notes-v2__cm-inline-math-preview")).toHaveLength(1);
    expect(host.textContent).toContain(String.raw`\(x^2\)`);

    view.destroy();
    host.remove();
  });

  it("renders NotebookLM's double-escaped inline math", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ["Paragraph", "Copied \\\\(G_0(s) = \\frac{K}{s(0.2s + 1)}\\\\)"].join("\n"),
        extensions: [createNotesMixedRendering()],
      }),
    });

    expect(host.querySelectorAll(".notes-v2__cm-inline-math-preview")).toHaveLength(1);
    expect(
      host.querySelector(".notes-v2__cm-inline-math-preview .katex"),
    ).not.toBeNull();

    view.destroy();
    host.remove();
  });
});
