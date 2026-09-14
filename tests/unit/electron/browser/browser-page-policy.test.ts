import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createBrowserPagePolicy,
  decideHttpNavigation,
} = require("../../../../electron/browser/browser-page-policy.cjs");

describe("browser page policy", () => {
  it("allows only credential-free HTTP(S) destinations", () => {
    expect(decideHttpNavigation("https://example.com/path")).toMatchObject({ allowed: true });
    expect(decideHttpNavigation("http://example.com/")).toMatchObject({ allowed: true });
    for (const url of [
      "file:///tmp/private",
      "javascript:alert(1)",
      "data:text/html,hello",
      "mailto:test@example.com",
      "https://user:pass@example.com/",
      "not a url",
    ]) {
      expect(decideHttpNavigation(url), url).toMatchObject({ allowed: false });
    }
  });

  it("denies popups, webview attachment, and external protocols", () => {
    const contents = createFakeWebContents();
    const policy = createBrowserPagePolicy();
    const dispose = policy.attach(contents);

    const popupResult = contents.windowOpenHandler?.({ url: "https://example.com/popup" });
    expect(popupResult).toEqual({ action: "deny" });

    const attachEvent = { preventDefault: vi.fn() };
    contents.emit("will-attach-webview", attachEvent, {}, {});
    expect(attachEvent.preventDefault).toHaveBeenCalledOnce();

    const externalEvent = { preventDefault: vi.fn() };
    contents.emit("will-navigate", externalEvent, "mailto:test@example.com");
    expect(externalEvent.preventDefault).toHaveBeenCalledOnce();
    dispose();
  });

  it("uses an injected URL decision and detaches all listeners", () => {
    const contents = createFakeWebContents();
    const decideNavigation = vi.fn((url: string) => ({
      allowed: url === "https://allowed.test/",
      reason: "fixture",
    }));
    const policy = createBrowserPagePolicy({ decideNavigation });
    const dispose = policy.attach(contents);

    const allowed = { preventDefault: vi.fn() };
    contents.emit("will-navigate", allowed, "https://allowed.test/");
    expect(allowed.preventDefault).not.toHaveBeenCalled();

    const blocked = { preventDefault: vi.fn() };
    contents.emit("will-navigate", blocked, "https://blocked.test/");
    expect(blocked.preventDefault).toHaveBeenCalledOnce();
    expect(decideNavigation).toHaveBeenCalledTimes(2);

    dispose();
    const late = { preventDefault: vi.fn() };
    contents.emit("will-navigate", late, "https://blocked.test/");
    expect(late.preventDefault).not.toHaveBeenCalled();
  });
});

function createFakeWebContents() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    windowOpenHandler: null as null | ((details: { url: string }) => { action: string }),
    emit(name: string, ...args: unknown[]) {
      for (const listener of listeners.get(name) ?? []) listener(...args);
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
    },
    removeListener(name: string, listener: (...args: unknown[]) => void) {
      listeners.get(name)?.delete(listener);
    },
    setWindowOpenHandler(handler: (details: { url: string }) => { action: string }) {
      this.windowOpenHandler = handler;
    },
  };
}
