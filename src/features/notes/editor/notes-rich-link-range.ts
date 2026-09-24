import type { Node as ProseMirrorNode, Mark } from "prosemirror-model";

export type NotesRichLinkMarkRange = {
  from: number;
  mark: Mark;
  to: number;
};

/** Find the complete contiguous link mark around a caret, including inline images. */
export function findNotesRichLinkMarkRange(
  doc: ProseMirrorNode,
  position: number,
): NotesRichLinkMarkRange | null {
  const boundedPosition = Math.min(Math.max(position, 0), doc.content.size);
  const $position = doc.resolve(boundedPosition);
  const parent = $position.parent;
  const parentStart = $position.start();

  let linkMark: Mark | null = null;
  let childOffset = 0;
  for (let index = 0; index < parent.childCount; index += 1) {
    const child = parent.child(index);
    const childFrom = parentStart + childOffset;
    const childTo = childFrom + child.nodeSize;
    const touchesCaret =
      (boundedPosition >= childFrom && boundedPosition < childTo) ||
      (boundedPosition === childTo && index === parent.childCount - 1);

    if (child.isInline && touchesCaret) {
      linkMark = child.marks.find((mark) => mark.type.name === "link") ?? null;
      if (!linkMark && boundedPosition === childFrom && index > 0) {
        const previous = parent.child(index - 1);
        linkMark = previous.marks.find((mark) => mark.type.name === "link") ?? null;
      }
      if (linkMark) break;
    }
    childOffset += child.nodeSize;
  }

  if (!linkMark) return null;

  const expectedMark = linkMark;
  let activeFrom: number | null = null;
  let activeTo = parentStart;
  childOffset = 0;

  for (let index = 0; index < parent.childCount; index += 1) {
    const child = parent.child(index);
    const childFrom = parentStart + childOffset;
    const childTo = childFrom + child.nodeSize;
    const hasSameMark =
      child.isInline && child.marks.some((mark) => mark.eq(expectedMark));

    if (hasSameMark) {
      if (activeFrom === null) activeFrom = childFrom;
      activeTo = childTo;
    } else if (activeFrom !== null) {
      if (boundedPosition >= activeFrom && boundedPosition <= activeTo) {
        return { from: activeFrom, mark: expectedMark, to: activeTo };
      }
      activeFrom = null;
      activeTo = childFrom;
    }

    childOffset += child.nodeSize;
  }

  if (
    activeFrom !== null &&
    boundedPosition >= activeFrom &&
    boundedPosition <= activeTo
  ) {
    return { from: activeFrom, mark: expectedMark, to: activeTo };
  }

  return null;
}
