import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  EditorView,
  NodeView,
} from "prosemirror-view";
import { renderMathMarkup } from "@/features/notes/editor/code-block-preview";

type MathNodeKind = "block" | "inline";

class NotesMathNodeView implements NodeView {
  dom: HTMLElement;
  private content: string;
  private editor: HTMLInputElement | HTMLTextAreaElement | null = null;
  private editing = false;
  private preview: HTMLElement;
  private livePreview: HTMLElement | null = null;

  constructor(
    private node: ProseMirrorNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private kind: MathNodeKind,
  ) {
    this.content = String(node.attrs.content ?? "");
    this.dom = document.createElement(kind === "inline" ? "span" : "div");
    this.dom.className = `notes-v2__math-${kind} notes-v2__math-node`;
    this.dom.dataset.mathKind = kind;
    this.dom.dataset.mathSource = this.content;
    this.dom.setAttribute("role", "math");
    this.dom.setAttribute("aria-label", `LaTeX: ${this.content}`);
    this.dom.setAttribute("aria-roledescription", "mathematical expression");
    this.dom.tabIndex = 0;

    this.preview = document.createElement("span");
    this.preview.className = `notes-v2__math-${kind}-preview`;
    this.dom.append(this.preview);
    this.renderInto(this.preview, this.content, kind === "block");

    this.dom.addEventListener("click", this.handleClick);
    this.dom.addEventListener("keydown", this.handlePreviewKeydown);
  }

  private renderInto(target: HTMLElement, content: string, displayMode: boolean) {
    target.innerHTML = "";
    if (!content.trim()) {
      target.textContent = "空公式";
      target.classList.add("notes-v2__math-preview--empty");
      return;
    }

    target.classList.remove("notes-v2__math-preview--empty");
    try {
      target.innerHTML = renderMathMarkup(content, displayMode);
    } catch {
      target.textContent = content;
    }
  }

  private handleClick = (event: MouseEvent) => {
    if (this.editor && this.editor.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    this.enterEditMode();
  };

  private handlePreviewKeydown = (event: KeyboardEvent) => {
    if (this.editing || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    this.enterEditMode();
  };

  private enterEditMode() {
    if (this.editing) {
      this.editor?.focus();
      return;
    }

    this.editing = true;
    this.dom.classList.add("is-editing");
    this.preview.hidden = true;

    this.livePreview = document.createElement("span");
    this.livePreview.className = "notes-v2__math-live-preview";
    this.livePreview.setAttribute("aria-hidden", "true");
    this.renderInto(this.livePreview, this.content, this.kind === "block");

    this.editor =
      this.kind === "inline"
        ? document.createElement("input")
        : document.createElement("textarea");
    this.editor.className = `notes-v2__math-${this.kind}-source`;
    this.editor.value = this.content;
    this.editor.readOnly = !this.view.editable;
    this.editor.setAttribute("aria-label", "LaTeX 源码");
    this.editor.spellcheck = false;

    if (this.editor instanceof HTMLInputElement) {
      this.editor.type = "text";
      this.resizeInlineEditor();
    } else {
      this.editor.rows = Math.max(3, this.content.split("\n").length);
    }

    this.editor.addEventListener("input", this.handleInput);
    this.editor.addEventListener("keydown", this.handleEditorKeydown);
    this.editor.addEventListener("blur", this.handleBlur);
    this.dom.append(this.editor, this.livePreview);

    requestAnimationFrame(() => {
      this.editor?.focus();
      this.editor?.select();
    });
  }

  private resizeInlineEditor() {
    if (!(this.editor instanceof HTMLInputElement)) return;
    this.editor.style.width = `${Math.max(6, this.editor.value.length + 1)}ch`;
  }

  private handleInput = () => {
    if (!this.editor || !this.livePreview) return;
    this.resizeInlineEditor();
    this.renderInto(
      this.livePreview,
      this.editor.value,
      this.kind === "block",
    );
  };

  private handleEditorKeydown = (rawEvent: Event) => {
    const event = rawEvent as KeyboardEvent;
    if (event.key === "Escape") {
      event.preventDefault();
      this.exitEditMode(false);
      this.view.focus();
      return;
    }

    const shouldCommit =
      this.kind === "inline"
        ? event.key === "Enter"
        : event.key === "Enter" && (event.metaKey || event.ctrlKey);
    if (!shouldCommit) return;

    event.preventDefault();
    this.exitEditMode(true);
    this.view.focus();
  };

  private handleBlur = () => {
    this.exitEditMode(true);
  };

  private commit(nextContent: string) {
    if (!this.view.editable || nextContent === this.content) return;
    const position = this.getPos();
    if (position === undefined) return;

    this.content = nextContent;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(position, undefined, {
        ...this.node.attrs,
        content: nextContent,
      }),
    );
  }

  private exitEditMode(commit: boolean) {
    if (!this.editing) return;
    const nextContent = this.editor?.value ?? this.content;
    if (commit) this.commit(nextContent);

    this.editor?.removeEventListener("input", this.handleInput);
    this.editor?.removeEventListener("keydown", this.handleEditorKeydown);
    this.editor?.removeEventListener("blur", this.handleBlur);
    this.editor?.remove();
    this.livePreview?.remove();
    this.editor = null;
    this.livePreview = null;
    this.editing = false;
    this.dom.classList.remove("is-editing");
    this.preview.hidden = false;
    this.dom.dataset.mathSource = this.content;
    this.dom.setAttribute("aria-label", `LaTeX: ${this.content}`);
    this.renderInto(this.preview, this.content, this.kind === "block");
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const nextContent = String(node.attrs.content ?? "");
    if (!this.editing && nextContent !== this.content) {
      this.content = nextContent;
      this.dom.dataset.mathSource = nextContent;
      this.renderInto(this.preview, nextContent, this.kind === "block");
    }
    return true;
  }

  stopEvent(event: Event) {
    return this.editing && this.dom.contains(event.target as Node);
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.dom.removeEventListener("click", this.handleClick);
    this.dom.removeEventListener("keydown", this.handlePreviewKeydown);
    this.editor?.removeEventListener("input", this.handleInput);
    this.editor?.removeEventListener("keydown", this.handleEditorKeydown);
    this.editor?.removeEventListener("blur", this.handleBlur);
  }
}

export function createNotesMathInlineNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
) {
  return new NotesMathNodeView(node, view, getPos, "inline");
}

export function createNotesMathBlockNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
) {
  return new NotesMathNodeView(node, view, getPos, "block");
}
