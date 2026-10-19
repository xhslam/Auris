/** VMark #1565 viewport-loading behaviour adapted to Auris native ProseMirror.
 * Reference: xiaolai/vmark @ 449fbc3e0, blockImage/BlockImageNodeView.ts (ISC).
 * Full notice: docs/vmark-port/UPSTREAM-LICENSE.txt. URLs never enter document attrs.
 */
import type { Node } from "prosemirror-model";
import type { NodeView, ViewMutationRecord } from "prosemirror-view";
import { resolveMarkdownImageSource } from "./code-block-preview";
import { loadNotesImageNearViewport } from "./notes-image-loading";

export class NotesRichImageNodeView implements NodeView {
  readonly dom = document.createElement("img");
  private cancel = () => {};
  private identity = "";
  private destroyed = false;
  constructor(
    private node: Node,
    private root: HTMLElement | null,
    private owner: () => { path: string | null; reloadKey: number },
    private onDestroy: () => void = () => {},
  ) { this.refresh(); }

  refresh() {
    if (this.destroyed) return;
    const { path, reloadKey } = this.owner();
    const { src, alt, title } = this.node.attrs;
    // Pure URL normalization, not IO. Only Vault URLs include the reload version;
    // remote/data images must stay mounted across unrelated Vault notifications.
    const resolved = resolveMarkdownImageSource(typeof src === "string" ? src : "", path, reloadKey);
    const identity = JSON.stringify(resolved);
    this.dom.alt = typeof alt === "string" ? alt : "";
    if (title) this.dom.title = String(title); else this.dom.removeAttribute("title");
    if (identity === this.identity) return;
    this.identity = identity;
    this.cancel();
    this.dom.removeAttribute("src");
    // Freeze the owner-resolved URL before delaying, never use the later focused note.
    this.cancel = loadNotesImageNearViewport(this.dom, this.root, () => resolved);
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.refresh();
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord) { return mutation.type !== "selection"; }
  destroy() { this.destroyed = true; this.cancel(); this.onDestroy(); }
}
