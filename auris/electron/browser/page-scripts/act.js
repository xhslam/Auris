async function aurisActOnPage(args) {
  "use strict";

  const stores = globalThis.__aurisBrowserRefStores;
  const store = stores?.get(String(args.scopeKey || ""));

  function byRef(ref) {
    const element = store?.byRef.get(ref)?.deref();
    return element?.isConnected && element.ownerDocument === document ? element : null;
  }

  function resolveTarget(target) {
    if (!target || typeof target !== "object") return null;
    if (target.kind === "ref") return byRef(String(target.ref || ""));
    if (target.kind !== "selector") return null;
    try {
      return document.querySelector(String(target.selector || ""));
    } catch {
      return null;
    }
  }

  function hidden(element) {
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") {
        return true;
      }
      const style = globalThis.getComputedStyle?.(node);
      if (style?.display === "none" || style?.visibility === "hidden") return true;
    }
    return false;
  }

  function usable(element) {
    if (!element?.isConnected) return "TARGET_DETACHED";
    if (hidden(element)) return "TARGET_HIDDEN";
    if (element.hasAttribute("disabled")
      || element.getAttribute("aria-disabled") === "true"
      || element.matches?.(":disabled") === true) return "TARGET_DISABLED";
    return null;
  }

  if (args.variant === "scroll") {
    const x = Number(args.deltaX) || 0;
    const y = Number(args.deltaY) || 0;
    if (typeof globalThis.scrollBy === "function") {
      try { globalThis.scrollBy({ behavior: "auto", left: x, top: y }); } catch { /* no-op */ }
    }
    return { acted: true, variant: "scroll" };
  }

  if (args.variant === "key") {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: args.key }));
    target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: args.key }));
    return { acted: true, variant: "key" };
  }

  const target = resolveTarget(args.target);
  const targetError = usable(target);
  if (targetError) return { error: targetError };

  if (args.variant === "click") {
    target.click();
    return { acted: true, variant: "click" };
  }

  if (args.variant === "type") {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return { error: "TARGET_NOT_EDITABLE" };
    }
    target.focus();
    target.value = String(args.text || "");
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return { acted: true, variant: "type" };
  }

  if (args.variant === "style") {
    const css = String(args.css || "");
    if (/(?:@import|url\s*\()/iu.test(css)) return { error: "UNSAFE_STYLE" };
    target.style.cssText = css;
    return { acted: true, variant: "style" };
  }

  return { error: "UNSUPPORTED_ACTION" };
}
