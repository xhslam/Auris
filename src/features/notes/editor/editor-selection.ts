import { EditorSelection } from "@codemirror/state";

function clampPosition(position: number, documentLength: number) {
  return Math.min(Math.max(position, 0), documentLength);
}

export function clampSelectionToDocument(
  selection: EditorSelection,
  documentLength: number,
) {
  return EditorSelection.create(
    selection.ranges.map((range) =>
      EditorSelection.range(
        clampPosition(range.anchor, documentLength),
        clampPosition(range.head, documentLength),
      ),
    ),
    selection.mainIndex,
  );
}
