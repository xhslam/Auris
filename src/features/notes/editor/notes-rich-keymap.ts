import { setBlockType, splitBlock, toggleMark, wrapIn } from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import type { Schema } from "prosemirror-model";
import { TextSelection, type Command } from "prosemirror-state";

// ─────────────────────────────────────────────────────────────────────────────
// WYSIWYG (ProseMirror) formatting keymap.
//
// Brings the default WYSIWYG mode to parity with the CodeMirror source mode,
// which already has these shortcuts. Same semantics so muscle memory carries
// across both modes. Returned bindings are merged ahead of baseKeymap so the
// list-aware Enter/Tab handlers take priority but fall through when not in a
// list.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the current block to a heading of `level`, or back to a paragraph when
 * it is already that heading level (toggle behaviour, matching source mode).
 */
function toggleHeading(schema: Schema, level: number): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection;
    const node = $from.node($from.depth);

    if (
      node.type === schema.nodes.heading &&
      node.attrs.level === level &&
      schema.nodes.paragraph
    ) {
      return setBlockType(schema.nodes.paragraph)(state, dispatch, view);
    }

    return setBlockType(schema.nodes.heading, { level })(state, dispatch, view);
  };
}

/**
 * Mod-k: toggle link on selection, or insert link template if selection is empty.
 * Matches CodeMirror source-mode toggleMarkdownLink behaviour.
 */
function toggleRichLink(schema: Schema): Command {
  return (state, dispatch) => {
    const link = schema.marks.link;
    if (!link) return false;
    const { selection } = state;

    if (selection.empty) {
      if (dispatch) {
        const textNode = schema.text("link", [link.create({ href: "https://" })]);
        const tr = state.tr.replaceSelectionWith(textNode, false);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    const { from, to } = selection;
    let hasLink = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (link.isInSet(node.marks)) {
        hasLink = true;
        return false;
      }
    });

    if (hasLink) {
      return toggleMark(link)(state, dispatch);
    }

    const selectedText = state.doc.textBetween(from, to, "\n");
    const isUrl = /^https?:\/\//i.test(selectedText.trim());
    const href = isUrl ? selectedText.trim() : "https://";

    if (dispatch) {
      const tr = state.tr.addMark(from, to, link.create({ href }));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Behavior adapted from VMark v0.9.99 sourceLineNodes.ts / runEditorAction:
// formatting must not replace a fenced code block through a secondary entry.
// Auris owns a ProseMirror keymap, so it guards commands rather than removing
// Tiptap shortcuts. Consume blocked keys so no lower keymap can handle them.
function guardCodeFormatting(command: Command): Command {
  return (state, dispatch, view) => {
    const { from, to, $from, $to } = state.selection;
    let inCode = $from.parent.type.spec.code || $to.parent.type.spec.code;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.type.spec.code) inCode = true;
    });
    return inCode ? true : command(state, dispatch, view);
  };
}

export function createNotesRichKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = {};
  const bind = (key: string, command: Command | undefined, formatting = true) => {
    if (command) {
      keys[key] = formatting ? guardCodeFormatting(command) : command;
    }
  };

  // ── Inline marks ───────────────────────────────────────────────────────────
  if (schema.marks.strong) {
    bind("Mod-b", toggleMark(schema.marks.strong));
    bind("Mod-B", toggleMark(schema.marks.strong));
  }

  if (schema.marks.em) {
    bind("Mod-i", toggleMark(schema.marks.em));
    bind("Mod-I", toggleMark(schema.marks.em));
  }

  if (schema.marks.code) {
    bind("Mod-e", toggleMark(schema.marks.code));
    bind("Mod-E", toggleMark(schema.marks.code));
  }

  if (schema.marks.link) {
    bind("Mod-k", toggleRichLink(schema));
    bind("Mod-K", toggleRichLink(schema));
  }

  const strikeMark = schema.marks.strikethrough || schema.marks.s;
  if (strikeMark) {
    bind("Mod-Shift-x", toggleMark(strikeMark));
    bind("Mod-Shift-X", toggleMark(strikeMark));
    bind("Mod-Alt-s", toggleMark(strikeMark));
  }

  // ── Headings & paragraph ────────────────────────────────────────────────────
  if (schema.nodes.heading) {
    for (let level = 1; level <= 6; level += 1) {
      bind(`Mod-${level}`, toggleHeading(schema, level));
    }
  }

  if (schema.nodes.paragraph) {
    bind("Mod-0", setBlockType(schema.nodes.paragraph));
  }

  // ── Blocks ──────────────────────────────────────────────────────────────────
  if (schema.nodes.blockquote) {
    bind("Mod-Alt-q", wrapIn(schema.nodes.blockquote));
  }

  if (schema.nodes.code_block) {
    bind("Mod-Alt-c", setBlockType(schema.nodes.code_block));
  }

  // ── Lists ───────────────────────────────────────────────────────────────────
  if (schema.nodes.bullet_list) {
    bind("Mod-Alt-u", wrapInList(schema.nodes.bullet_list));
    bind("Mod-Shift-8", wrapInList(schema.nodes.bullet_list));
  }

  if (schema.nodes.ordered_list) {
    bind("Mod-Alt-o", wrapInList(schema.nodes.ordered_list));
    bind("Mod-Shift-9", wrapInList(schema.nodes.ordered_list));
  }

  // Safe block split for cross-block selections (aligned with vmark audit F5).
  const handleCrossBlockEnter: Command = (state, dispatch, view) => {
    const { selection } = state;
    if (selection.empty) return false;
    if (!(selection instanceof TextSelection)) return false;

    const { $from, $to } = selection;
    if ($from.sameParent($to)) return false;

    return splitBlock(state, dispatch, view);
  };

  // Enter key: inside a list item, split the list item.
  // When a non-collapsed selection spans across blocks, splitBlock safely (F5).
  // Otherwise, return false to fall through to baseKeymap.
  const enterCommand: Command = (state, dispatch, view) => {
    if (
      schema.nodes.list_item &&
      splitListItem(schema.nodes.list_item)(state, dispatch, view)
    ) {
      return true;
    }
    if (handleCrossBlockEnter(state, dispatch, view)) {
      return true;
    }
    return false;
  };
  bind("Enter", enterCommand, false);

  // Tab indent/outdent in lists
  if (schema.nodes.list_item) {
    const listItem = schema.nodes.list_item;
    bind("Tab", sinkListItem(listItem), false);
    bind("Shift-Tab", liftListItem(listItem), false);
    bind("Mod-]", sinkListItem(listItem), false);
    bind("Mod-[", liftListItem(listItem), false);
  }

  return keys;
}
