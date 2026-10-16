// Behavioral comparison with VMark regression #1491 at
// fa785a7008999bc2077889a9faaca0175f122cee, ISC license:
// src/plugins/sourceFootnotePopup/sourceFootnoteEditing.test.ts.
// Auris has no footnote popup. These cases verify its existing source editor,
// without claiming popup preview or explicit popup autofocus parity.
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotesEditorState } from "@/features/notes/editor/editor-state-bridge";

const source = "See [^来源]\n\n[^来源]: 中文参考文献 — العربية\n    continuation text";
let view: EditorView;
let parent: HTMLElement;
let onChange: ReturnType<typeof vi.fn<(source: string) => void>>;

function setup(position: number) {
  parent = document.createElement("div");
  document.body.append(parent);
  onChange = vi.fn();
  view = new EditorView({
    parent,
    state: createNotesEditorState(source, onChange),
  });
  view.dispatch({ selection: EditorSelection.cursor(position) });
  view.focus();
}

function pointer(type: string) {
  view.contentDOM.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

async function settle() {
  // Longer than upstream's 150ms hover delay; use real editor scheduling.
  await new Promise((resolve) => setTimeout(resolve, 200));
}

afterEach(() => {
  view?.destroy();
  parent?.remove();
});

describe("source footnotes preserve editing continuity (VMark #1491)", () => {
  it.each([
    ["definition body", "参考"],
    ["RTL body", "العربية"],
    ["continuation", "continuation"],
    ["reference marker", "[^来源]"],
    ["definition marker", "[^来源]:"],
  ])("keeps focus and edits %s after pointer activity", async (_label, token) => {
    const position = source.indexOf(token);
    setup(position);
    pointer("click");
    pointer("mousemove");
    await settle();

    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(position);
    expect(onChange).not.toHaveBeenCalled();
    view.dispatch(view.state.replaceSelection("新"));
    const expected = source.slice(0, position) + "新" + source.slice(position);
    expect(view.state.sliceDoc()).toBe(expected);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it.each(["click", "mousemove"])("preserves selected text after %s", async (event) => {
    const position = source.indexOf("[^来源]");
    setup(position);
    const selection = EditorSelection.single(position, position + "[^来源]".length);
    view.dispatch({ selection });
    pointer(event);
    await settle();

    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.state.sliceDoc()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves a nonempty secondary selection with an empty main cursor", async () => {
    setup(source.indexOf("[^来源]"));
    const body = source.indexOf("参考");
    const selection = EditorSelection.create([
      EditorSelection.cursor(source.indexOf("[^来源]")),
      EditorSelection.range(body, body + 2),
    ], 0);
    view.dispatch({ selection });
    pointer("click");
    pointer("mousemove");
    await settle();

    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.hasFocus).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves selection begun after hover was dispatched", async () => {
    const position = source.indexOf("[^来源]");
    setup(position);
    pointer("mousemove");
    const selection = EditorSelection.single(position, position + 5);
    view.dispatch({ selection });
    await settle();

    expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.hasFocus).toBe(true);
    view.dispatch(view.state.replaceSelection("替换"));
    const expected = source.slice(0, position) + "替换" + source.slice(position + 5);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("does not reclaim focus after the user leaves the editor during hover", async () => {
    setup(source.indexOf("[^来源]"));
    pointer("mousemove");
    const input = document.createElement("input");
    parent.append(input);
    input.focus();
    await settle();

    expect(document.activeElement).toBe(input);
    expect(view.hasFocus).toBe(false);
    expect(view.state.sliceDoc()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });
});
