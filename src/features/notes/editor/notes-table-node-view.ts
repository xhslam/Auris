/**
 * Adapted from VMark src/plugins/tableScroll/plugin.ts at
 * 00ad428592dc5e80aab5afc8878a3f8c3bd27930 (v0.9.94).
 * Copyright (c) 2026 Xiaolai Li. ISC License; see
 * docs/vmark-port/UPSTREAM-LICENSE.txt.
 *
 * Auris uses the same ProseMirror NodeView directly instead of the Tiptap
 * extension wrapper. Only imports and the scoped CSS class differ upstream.
 * Explicit dom/contentDOM preserves cursor mapping and table commands.
 */
import type { Node as PMNode } from "prosemirror-model";
import type { NodeView, ViewMutationRecord } from "prosemirror-view";

export class NotesTableScrollNodeView implements NodeView {
  dom: HTMLDivElement;
  table: HTMLTableElement;
  contentDOM: HTMLTableSectionElement;
  node: PMNode;

  constructor(node: PMNode) {
    this.node = node;
    this.dom = document.createElement("div");
    this.dom.className = "notes-v2__table-scroll-wrapper";
    this.table = document.createElement("table");
    this.dom.appendChild(this.table);
    this.contentDOM = document.createElement("tbody");
    this.table.appendChild(this.contentDOM);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (
      mutation.type === "attributes" &&
      (mutation.target === this.dom || mutation.target === this.table)
    ) {
      return true;
    }
    if (!this.contentDOM.contains(mutation.target)) return true;

    const target = mutation.target as HTMLElement;
    if (target.classList?.contains("table-resize-handle")) return true;

    if (mutation.type === "childList") {
      const nodes = [
        ...Array.from(mutation.addedNodes ?? []),
        ...Array.from(mutation.removedNodes ?? []),
      ];
      if (nodes.some((node) => (node as HTMLElement).classList?.contains("table-resize-handle"))) {
        return true;
      }
    }

    return false;
  }
}
