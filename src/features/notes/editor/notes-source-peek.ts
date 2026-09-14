import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
} from "prosemirror-state";
import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import {
  notesRichEditorSchema,
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

export type NotesSourcePeekRange = {
  from: number;
  to: number;
};

const COMPOUND_BLOCK_TYPES = new Set([
  "table",
  "bullet_list",
  "ordered_list",
  "blockquote",
]);

const EXCLUDED_BLOCK_TYPES = new Set([
  "code_block",
  "horizontal_rule",
]);

function clampPosition(position: number, doc: ProseMirrorNode) {
  return Math.min(Math.max(Math.round(position), 0), doc.content.size);
}

export function canUseNotesSourcePeek(typeName: string) {
  return !EXCLUDED_BLOCK_TYPES.has(typeName);
}

export function getNotesSourcePeekRange(
  state: EditorState,
): NotesSourcePeekRange {
  const { $from, $to } = state.selection;

  if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
    return { from: state.selection.from, to: state.selection.to };
  }

  let targetDepth = 1;

  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if (COMPOUND_BLOCK_TYPES.has($from.node(depth).type.name)) {
      targetDepth = depth;
      break;
    }
  }

  targetDepth = Math.min(targetDepth, $from.depth, $to.depth);

  if (targetDepth < 1) {
    return { from: state.selection.from, to: state.selection.to };
  }

  return {
    from: $from.before(targetDepth),
    to: $to.after(targetDepth),
  };
}

function createSourcePeekDocument(slice: Slice) {
  let content = slice.content;
  const paragraph = notesRichEditorSchema.nodes.paragraph;

  if (content.childCount === 0 && paragraph) {
    content = Fragment.from(paragraph.create());
  } else if (content.firstChild && !content.firstChild.isBlock && paragraph) {
    content = Fragment.from(paragraph.create(null, content));
  }

  return notesRichEditorSchema.topNodeType.createAndFill(null, content) ??
    notesRichEditorSchema.topNodeType.create(null, content);
}

export function serializeNotesSourcePeekRange(
  state: EditorState,
  range: NotesSourcePeekRange,
) {
  return serializeNotesRichMarkdown(
    createSourcePeekDocument(state.doc.slice(range.from, range.to)),
  );
}

function createNotesSourcePeekSlice(markdown: string) {
  const parsed = parseNotesRichMarkdown(markdown);
  return new Slice(parsed.content, 0, 0);
}

export function applyNotesSourcePeekMarkdown(
  view: Pick<EditorView, "dispatch" | "state">,
  range: NotesSourcePeekRange,
  markdown: string,
  selection = view.state.selection,
) {
  try {
    const transaction = view.state.tr.replaceRange(
      range.from,
      range.to,
      createNotesSourcePeekSlice(markdown),
    );
    const replacementFrom = clampPosition(
      transaction.mapping.map(range.from, -1),
      transaction.doc,
    );
    const replacementTo = clampPosition(
      transaction.mapping.map(range.to, 1),
      transaction.doc,
    );
    const clampToReplacement = (position: number) =>
      Math.min(Math.max(position, replacementFrom), replacementTo);
    const from = clampToReplacement(
      clampPosition(
        replacementFrom + Math.max(0, selection.from - range.from),
        transaction.doc,
      ),
    );
    const to = clampToReplacement(
      clampPosition(
        replacementFrom + Math.max(0, selection.to - range.from),
        transaction.doc,
      ),
    );

    view.dispatch(
      transaction
        .setSelection(
          from === to
            ? Selection.near(transaction.doc.resolve(from))
            : TextSelection.create(transaction.doc, from, to),
        )
        .scrollIntoView(),
    );
    return true;
  } catch {
    return false;
  }
}

export function getNotesSourcePeekNode(
  state: EditorState,
  range: NotesSourcePeekRange,
): ProseMirrorNode | null {
  return state.doc.nodeAt(range.from);
}
