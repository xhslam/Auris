import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import type { Schema } from "prosemirror-model";
import type { Command } from "prosemirror-state";

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

export function createNotesRichKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = {};
  const bind = (key: string, command: Command | undefined) => {
    if (command) {
      keys[key] = command;
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

  // List-item editing: split on Enter, indent/outdent on Tab. Each command
  // returns false outside a list, so the bindings fall through to baseKeymap.
  if (schema.nodes.list_item) {
    const listItem = schema.nodes.list_item;
    bind("Enter", splitListItem(listItem));
    bind("Tab", sinkListItem(listItem));
    bind("Shift-Tab", liftListItem(listItem));
    bind("Mod-]", sinkListItem(listItem));
    bind("Mod-[", liftListItem(listItem));
  }

  return keys;
}
