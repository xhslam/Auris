async function aurisWaitForTarget(args) {
  "use strict";

  const deadline = Date.now() + Math.max(0, Math.min(120_000, Number(args.timeoutMs) || 0));
  const stores = globalThis.__aurisBrowserRefStores;
  const store = stores?.get(String(args.scopeKey || ""));

  function resolve() {
    if (args.target?.kind === "ref") {
      const element = store?.byRef.get(String(args.target.ref || ""))?.deref();
      return element?.isConnected && element.ownerDocument === document ? element : null;
    }
    if (args.target?.kind !== "selector") return null;
    try {
      return document.querySelector(String(args.target.selector || ""));
    } catch {
      return null;
    }
  }

  function visible(element) {
    if (!element?.isConnected) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = globalThis.getComputedStyle?.(node);
      if (style?.display === "none" || style?.visibility === "hidden") return false;
    }
    return true;
  }

  do {
    const element = resolve();
    if (visible(element)) return { found: true };
    if (Date.now() >= deadline) return { error: "WAIT_TIMEOUT" };
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  } while (true);
}
