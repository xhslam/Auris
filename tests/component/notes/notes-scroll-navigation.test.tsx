import { act, cleanup, renderHook } from "@testing-library/react";
import { EditorState as CodeMirrorState } from "@codemirror/state";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { EditorState as RichState } from "prosemirror-state";
import { EditorView as RichView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotesScrollMemory } from "@/components/notes-v2/use-notes-scroll-memory";
import { createNotesEditorBridge } from "@/features/notes/editor/editor-state-bridge";
import { createNotesRichEditorBridge } from "@/features/notes/editor/notes-rich-editor-bridge";
import {
  cancelNotesScrollRestore,
  resetNotesScrollMemoryForTests,
  restoreNotesScroll,
  setNotesScrollOffset,
} from "@/features/notes/editor/notes-scroll-memory";

// VMark #1561: remembered reading pixels never override an explicit jump.
// Controlled geometry proves ownership/order only, not real desktop layout.
describe("Notes reading restore versus explicit navigation", () => {
  let frames: FrameRequestCallback[];
  const destroyViews: (() => void)[] = [];

  beforeEach(() => {
    frames = [];
    resetNotesScrollMemoryForTests();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    for (const destroy of destroyViews.splice(0)) destroy();
    resetNotesScrollMemoryForTests();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  function scrollHost() {
    const host = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    Object.defineProperties(scroller, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 2000 },
    });
    host.append(scroller);
    document.body.append(host);
    return { host, scroller };
  }

  it("does not start a pending restore after explicit navigation before the first frame", () => {
    const { host, scroller } = scrollHost();
    setNotesScrollOffset("a.md", "source", 700);
    renderHook(() => useNotesScrollMemory({
      enabled: true, hostRef: { current: host }, path: "a.md", surface: "source",
    }));
    cancelNotesScrollRestore();
    scroller.scrollTop = 120;
    act(() => { frames.shift()?.(0); });
    expect(scroller.scrollTop).toBe(120);
  });

  it("still restores a returning source document even when the editor has a caret", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = new CodeMirrorView({ parent: host, state: CodeMirrorState.create({ doc: "one\ntwo" }) });
    const scroller = view.scrollDOM;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 2000 },
    });
    destroyViews.push(() => view.destroy());
    view.dispatch({ selection: { anchor: 2 } });
    setNotesScrollOffset("a.md", "source", 700);
    const hostRef = { current: host };
    renderHook(() => useNotesScrollMemory({
      enabled: true, hostRef, path: "a.md", surface: "source",
    }));
    act(() => { frames.splice(0).forEach((callback) => callback(0)); });
    expect(scroller.scrollTop).toBe(700);
    expect(view.state.selection.main.head).toBe(2);
  });

  for (const command of ["setSelection", "revealLine"] as const) {
    it(`rich ${command} takes DOM selection ownership before requesting scroll`, () => {
      const parent = document.createElement("div");
      document.body.append(parent);
      const view = new RichView(parent, { state: RichState.create({
        schema, doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text("one"))]),
      }) });
      destroyViews.push(() => view.destroy());
      const focus = vi.spyOn(view, "focus");
      const dispatch = vi.spyOn(view, "dispatch");
      const bridge = createNotesRichEditorBridge(view);
      act(() => {
        if (command === "setSelection") bridge.setSelection(1, 1);
        else bridge.revealLine(0);
      });
      // ProseMirror scrollToSelection skips scrolling while the DOM selection
      // belongs outside the view, as after opening a note/outline popover.
      expect(focus.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
      focus.mockRestore();
      dispatch.mockRestore();
    });
  }

  for (const surface of ["source", "wysiwyg"] as const) {
    for (const command of ["setSelection", "revealLine"] as const) {
      it(`${surface} ${command} cancels an already running reading restore`, () => {
        const { scroller } = scrollHost();
        const parent = document.createElement("div");
        document.body.append(parent);
        const bridge = surface === "source"
          ? (() => {
              const view = new CodeMirrorView({ parent, state: CodeMirrorState.create({ doc: "one\ntwo" }) });
              destroyViews.push(() => view.destroy());
              return createNotesEditorBridge(view);
            })()
          : (() => {
              const view = new RichView(parent, { state: RichState.create({
                schema, doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text("one")), schema.node("paragraph", null, schema.text("two"))]),
              }) });
              destroyViews.push(() => view.destroy());
              return createNotesRichEditorBridge(view);
            })();
        restoreNotesScroll(scroller, 700);
        expect(scroller.scrollTop).toBe(700);
        act(() => {
          if (command === "setSelection") bridge.setSelection(1, 1);
          else bridge.revealLine(1);
          // The navigation's actual destination must survive the old frame.
          scroller.scrollTop = 120;
          const pending = frames.splice(0);
          pending.forEach((callback) => callback(0));
        });
        expect(scroller.scrollTop).toBe(120);
      });
    }
  }
});
