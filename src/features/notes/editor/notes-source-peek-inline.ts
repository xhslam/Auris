import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView as CodeMirrorView, keymap } from "@codemirror/view";
import { Plugin, PluginKey, type Selection } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { NotesSourcePeekRange } from "@/features/notes/editor/notes-source-peek";

export const NOTES_SOURCE_PEEK_META = "shadowing-notes-source-peek";

export type NotesSourcePeekState = {
  livePreview: boolean;
  markdown: string;
  nodeType: string;
  originalMarkdown: string;
  range: NotesSourcePeekRange;
  selection: Selection;
};

export type NotesSourcePeekController = {
  cancel: (view: EditorView) => void;
  commit: (view: EditorView) => void;
  current: NotesSourcePeekState | null;
  toggleLivePreview: (view: EditorView) => void;
  updateMarkdown: (view: EditorView, markdown: string) => void;
};

type SourcePeekWidget = HTMLElement & {
  __notesSourcePeekView?: CodeMirrorView;
};

type SourcePeekPluginState = {
  decorations: DecorationSet;
};

const sourcePeekPluginKey = new PluginKey<SourcePeekPluginState>(
  "shadowing-notes-source-peek",
);

function getBlockLabel(nodeType: string) {
  const labels: Record<string, string> = {
    blockquote: "Blockquote",
    bullet_list: "Bullet List",
    heading: "Heading",
    ordered_list: "Numbered List",
    paragraph: "Paragraph",
    table: "Table",
  };

  return labels[nodeType] ?? nodeType;
}

function createIconButton(
  label: string,
  onClick: () => void,
  className: string,
) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
}

function createSourcePeekWidget(
  view: EditorView,
  controller: NotesSourcePeekController,
  peek: NotesSourcePeekState,
) {
  const wrapper = document.createElement("section") as SourcePeekWidget;
  wrapper.className = "notes-v2__source-peek-inline";
  wrapper.dataset.testid = "notes-source-peek";
  wrapper.setAttribute("aria-label", "Source Peek");

  const header = document.createElement("div");
  header.className = "notes-v2__source-peek-inline-header";

  const title = document.createElement("div");
  title.className = "notes-v2__source-peek-inline-title";
  title.textContent = "Source Peek";

  const blockType = document.createElement("span");
  blockType.className = "notes-v2__source-peek-inline-block-type";
  blockType.textContent = getBlockLabel(peek.nodeType);
  title.append(blockType);

  const actions = document.createElement("div");
  actions.className = "notes-v2__source-peek-inline-actions";
  const livePreview = createIconButton(
    "预览",
    () => controller.toggleLivePreview(view),
    "notes-v2__source-peek-inline-button",
  );
  livePreview.dataset.active = String(peek.livePreview);
  actions.append(
    livePreview,
    createIconButton(
      "取消",
      () => controller.cancel(view),
      "notes-v2__source-peek-inline-button",
    ),
    createIconButton(
      "保存",
      () => controller.commit(view),
      "notes-v2__source-peek-inline-button",
    ),
  );
  header.append(title, actions);

  const editorHost = document.createElement("div");
  editorHost.className = "notes-v2__source-peek-inline-editor";
  wrapper.append(header, editorHost);

  const editorState = EditorState.create({
    doc: peek.markdown,
    extensions: [
      history(),
      markdown(),
      CodeMirrorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            controller.commit(view);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            controller.cancel(view);
            return true;
          },
        },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      CodeMirrorView.updateListener.of((update) => {
        if (update.docChanged) {
          controller.updateMarkdown(view, update.state.doc.toString());
        }
      }),
    ],
  });

  wrapper.__notesSourcePeekView = new CodeMirrorView({
    parent: editorHost,
    state: editorState,
  });
  requestAnimationFrame(() => wrapper.__notesSourcePeekView?.focus());

  return wrapper;
}

export function createNotesSourcePeekPlugin(
  controller: NotesSourcePeekController,
) {
  let editorView: EditorView | null = null;

  return new Plugin<SourcePeekPluginState>({
    key: sourcePeekPluginKey,
    state: {
      apply(transaction, pluginState, _oldState, nextState) {
        const peek = controller.current;

        if (!peek) {
          return { decorations: DecorationSet.empty };
        }

        if (
          !transaction.getMeta(NOTES_SOURCE_PEEK_META) &&
          pluginState.decorations !== DecorationSet.empty
        ) {
          return {
            decorations: pluginState.decorations.map(transaction.mapping, transaction.doc),
          };
        }

        const node = nextState.doc.nodeAt(peek.range.from);

        if (!node) {
          return { decorations: DecorationSet.empty };
        }

        const widget = Decoration.widget(
          peek.range.from,
          () => {
            const placeholder = document.createElement("div");

            return editorView
              ? createSourcePeekWidget(editorView, controller, peek)
              : placeholder;
          },
          {
            destroy(dom) {
              (dom as SourcePeekWidget).__notesSourcePeekView?.destroy();
            },
            key: `source-peek:${peek.range.from}`,
            side: -1,
          },
        );
        const nodeDecoration = Decoration.node(
          peek.range.from,
          peek.range.from + node.nodeSize,
          {
            class: peek.livePreview
              ? "notes-v2__source-peek-preview"
              : "notes-v2__source-peek-hidden",
          },
        );

        return {
          decorations: DecorationSet.create(nextState.doc, [widget, nodeDecoration]),
        };
      },
      init() {
        return { decorations: DecorationSet.empty };
      },
    },
    props: {
      decorations(state) {
        return sourcePeekPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(view) {
      editorView = view;

      return {
        destroy() {
          editorView = null;
        },
      };
    },
  });
}
