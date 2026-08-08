import { describe, expect, it, vi } from "vitest";

import {
  createBrowserBridge,
  getBrowserBridge,
  type BrowserChromeSnapshot,
  type BrowserNativeBridge,
} from "../../../src/features/browser/browser-bridge";

describe("renderer browser bridge", () => {
  it("returns null when the desktop bridge is unavailable", () => {
    expect(getBrowserBridge({})).toBeNull();
  });

  it("forwards typed intents through the fixed native bridge", async () => {
    const native = createNativeBridge();
    const bridge = createBrowserBridge(native);

    await bridge.createTab({ url: "https://example.com/" });
    await bridge.closeTab({ tabId: "browser-tab-1" });
    await bridge.navigate({ tabId: "browser-tab-1", url: "https://example.com/two" });
    await bridge.find({ text: "Auris" });

    expect(native.invoke).toHaveBeenNthCalledWith(1, "createTab", { url: "https://example.com/" });
    expect(native.invoke).toHaveBeenNthCalledWith(2, "closeTab", { tabId: "browser-tab-1" });
    expect(native.invoke).toHaveBeenNthCalledWith(3, "navigate", { tabId: "browser-tab-1", url: "https://example.com/two" });
    expect(native.invoke).toHaveBeenNthCalledWith(4, "find", { text: "Auris" });
  });

  it("returns the native unsubscribe callback", () => {
    const native = createNativeBridge();
    const bridge = createBrowserBridge(native);
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);
    expect(native.subscribe).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(native.unsubscribe).toHaveBeenCalledWith(listener);
  });

  it("discovers window.aurisBrowser only when the shape is complete", () => {
    const native = createNativeBridge();
    expect(getBrowserBridge({ aurisBrowser: native })).not.toBeNull();
    expect(getBrowserBridge({ aurisBrowser: { invoke: vi.fn() } })).toBeNull();
  });
});

function createNativeBridge(): BrowserNativeBridge & {
  invoke: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(snapshot: BrowserChromeSnapshot) => void>();
  const unsubscribe = vi.fn((listener) => listeners.delete(listener));
  return {
    invoke: vi.fn(async () => null),
    subscribe: vi.fn((listener) => listeners.add(listener)),
    unsubscribe,
  };
}
