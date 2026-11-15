import { EditorView as CodeMirrorView } from "@codemirror/view";
import { Fragment, Slice } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { resolveNotesImagePath } from "./notes-image-path";
import { toast } from "sonner";
import type { NotesEditorSurfaceView } from "./editor-types";
import { prepareImageInsertion, validateNotesImageFile } from "./editor-image-attachments";

type ImageInsertionOptions = {
  notePath: string;
  from?: number;
  to?: number;
  isCurrent?: () => boolean;
  persistAttachment?: (path: string, content: Uint8Array) => Promise<void>;
};

/** Electron/ProseMirror adaptation of VMark imageHandlerInsert/Clipboard,
 * 449fbc3e0 (ISC; docs/vmark-port/UPSTREAM-LICENSE.txt).
 * Keep relative sources, persist before inserting, and recheck the owner after IO.
 * Unlike the upstream Tiptap host, both Auris editor engines use this entry point.
 */
export async function insertNotesImageFiles(
  view: NotesEditorSurfaceView,
  files: File[],
  options: ImageInsertionOptions,
) {
  const isSource = view instanceof CodeMirrorView;
  const initialDoc = view.state.doc;
  const writable = () => (isSource ? view.dom.isConnected : !view.isDestroyed) &&
    (isSource ? !view.state.readOnly : view.editable) &&
    (options.isCurrent?.() ?? true);
  if (!writable() || files.length === 0) return;
  // Validate the entire batch before creating any attachments.
  files.forEach(validateNotesImageFile);
  const from = options.from ?? (isSource ? view.state.selection.main.from : view.state.selection.from);
  const to = options.to ?? (isSource ? view.state.selection.main.to : view.state.selection.to);
  const notePath = await resolveNotesImagePath(options.notePath);
  const prepared = [];
  for (const file of files) {
    if (!writable()) return;
    if (view.state.doc !== initialDoc) throw new Error("笔记在读取图片期间发生变化，请重新插入图片。");
    prepared.push(await prepareImageInsertion({
      file,
      notePath,
      persistAttachment: options.persistAttachment ? async (path, content) => {
        if (!writable() || view.state.doc !== initialDoc) throw new Error("笔记已变化，已取消图片插入。");
        await options.persistAttachment!(path, content);
      } : undefined,
    }));
  }
  if (!writable()) return;
  // Do not replace intervening typing using stale offsets. Saved assets are kept,
  // but no stale transaction may modify a different note or newer document.
  if (view.state.doc !== initialDoc) {
    throw new Error("笔记在读取图片期间发生变化，请重新插入图片。");
  }
  if (isSource) {
    const text = `\n\n${prepared.map((image) => image.markdown).join("\n\n")}\n\n`;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input.paste" });
  } else {
    // An image-only paragraph makes the image occupy its own line while
    // retaining the existing inline-image Markdown schema. ProseMirror's
    // fitter splits the target text block without deleting either side.
    const images = prepared.map((image) => view.state.schema.nodes.paragraph.create(null,
      view.state.schema.nodes.image.create({ src: image.source, alt: image.alt, title: image.title }),
    ));
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    tr.replaceSelection(new Slice(Fragment.fromArray(images), 0, 0));
    view.dispatch(tr.scrollIntoView());
  }
  view.focus();
}

export function reportNotesImageError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "图片插入失败，请重试。");
}

export function saveNotesImageAttachment(path: string, content: Uint8Array) {
  const vault = window.shadowingDesktop?.vault;
  if (!vault?.saveFile) throw new Error("请先连接可写入的笔记工作区。");
  return vault.saveFile(path, content);
}
