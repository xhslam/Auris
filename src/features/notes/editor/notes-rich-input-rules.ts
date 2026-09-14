import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import type { MarkType, Schema } from "prosemirror-model";

// ─────────────────────────────────────────────────────────────────────────────
// WYSIWYG (ProseMirror) Markdown input rules.
//
// Mirrors the markdown-shortcut behaviour the CodeMirror source mode already
// has, so editing feels the same in both modes. Regexes are CJK-aware (using
// lookbehind instead of `\s` boundaries) because the default ProseMirror rules
// require whitespace before the marker — `你好**世界**` would never trigger.
// Borrowed from vmark's markInputRules approach.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a mark when the user types a closing inline marker (e.g. the second
 * `*` of `*italic*`). `match[1]` is the inner text that should be marked.
 */
function markInputRule(regexp: RegExp, markType: MarkType) {
  return new InputRule(regexp, (state, match, start, end) => {
    const inner = match[1];

    if (inner == null) {
      return null;
    }

    const fullMatch = match[0];
    const innerStart = start + fullMatch.indexOf(inner);
    const innerEnd = innerStart + inner.length;
    const tr = state.tr;

    // Delete the trailing marker, then the leading marker, then mark the text.
    if (innerEnd < end) {
      tr.delete(innerEnd, end);
    }

    if (innerStart > start) {
      tr.delete(start, innerStart);
    }

    const markFrom = start;
    const markTo = start + inner.length;

    tr.addMark(markFrom, markTo, markType.create());
    // Stop the mark from "leaking" into text typed after the closing marker.
    tr.removeStoredMark(markType);
    return tr;
  });
}

export function createNotesRichInputRules(schema: Schema) {
  const rules: InputRule[] = [];

  // ── Block rules ──────────────────────────────────────────────────────────
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
  }

  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)[.)]\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: Number(match[1]) }),
        (match, node) =>
          node.childCount + (node.attrs.order as number) === Number(match[1]),
      ),
    );
  }

  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-*+])\s$/, schema.nodes.bullet_list));
  }

  if (schema.nodes.code_block) {
    rules.push(textblockTypeInputRule(/^```$/, schema.nodes.code_block));
  }

  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
    );
  }

  // ── Inline mark rules (CJK-aware via lookbehind; match[1] = inner text) ────
  if (schema.marks.strong) {
    rules.push(markInputRule(/(?<=^|[^*])\*\*([^*]+)\*\*$/, schema.marks.strong));
    rules.push(markInputRule(/(?<=^|[^_])__([^_]+)__$/, schema.marks.strong));
  }

  if (schema.marks.em) {
    rules.push(markInputRule(/(?<=^|[^*])\*([^*]+)\*$/, schema.marks.em));
    rules.push(markInputRule(/(?<=^|[^_\p{L}\p{N}])_([^_]+)_$/u, schema.marks.em));
  }

  if (schema.marks.code) {
    rules.push(markInputRule(/(?<=^|[^`])`([^`]+)`$/, schema.marks.code));
  }

  const strikeMark = schema.marks.strikethrough || schema.marks.s;
  if (strikeMark) {
    rules.push(markInputRule(/(?<=^|[^~])~~([^~]+)~~$/, strikeMark));
  }

  return inputRules({ rules });
}
