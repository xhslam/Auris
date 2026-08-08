/**
 * Stable element refs scoped to a navigation generation.
 *
 * Adapted from VMark `src/lib/browser/agent/refs.ts` (xiaolai/vmark@7c409688).
 * Store key renamed to `__aurisBrowserRefStore` so Auris never shares VMark state.
 */

interface RefStore {
  refs: WeakMap<Element, string>;
  byRef: Map<string, WeakRef<Element>>;
  n: number;
  gen: number;
}

type DocWithStore = Document & { __aurisBrowserRefStore?: RefStore };

function storeFor(doc: Document, generation: number): RefStore {
  const holder = doc as DocWithStore;
  if (!holder.__aurisBrowserRefStore || holder.__aurisBrowserRefStore.gen !== generation) {
    holder.__aurisBrowserRefStore = {
      refs: new WeakMap(),
      byRef: new Map(),
      n: 0,
      gen: generation,
    };
  }
  return holder.__aurisBrowserRefStore;
}

/** Stable ref for `el` at `generation`, assigning a fresh one on first sight. */
export function refFor(el: Element, generation: number): string {
  const doc = el.ownerDocument;
  if (!doc) return "";
  const store = storeFor(doc, generation);
  const existing = store.refs.get(el);
  if (existing) return existing;
  const ref = `e${(store.n += 1)}`;
  store.refs.set(el, ref);
  store.byRef.set(ref, new WeakRef(el));
  return ref;
}

/** Resolve a ref at `generation`, or null if stale/unknown/detached. */
export function queryByRef(
  doc: Document,
  ref: string,
  generation: number,
): Element | null {
  const el = storeFor(doc, generation).byRef.get(ref)?.deref();
  if (!el || !el.isConnected || el.ownerDocument !== doc) return null;
  return el;
}
