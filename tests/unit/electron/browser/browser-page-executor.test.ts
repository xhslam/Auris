/* eslint-disable @typescript-eslint/no-explicit-any -- CDP and CommonJS executor mocks are intentionally shape-dynamic. */
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  PAGE_SCRIPT_PATHS,
  createBrowserPageExecutor,
  hashBrowserExecutorPayload,
} = require("../../../../electron/browser/browser-page-executor.cjs");
const { createBrowserPublicError } = require(
  "../../../../electron/shared/browser-contract.cjs",
);

type Control = {
  controlEpoch: number;
  leaseToken: string;
  navigationGeneration: number;
  tabId: string;
  windowId: string;
};

const control: Control = {
  controlEpoch: 4,
  leaseToken: "lease_token_1234567890",
  navigationGeneration: 7,
  tabId: "tab-one",
  windowId: "window-one",
};

class FakeWebContents extends EventEmitter {
  currentUrl = "https://research.test/form?private=value";
  destroyed = false;
  loadURL = vi.fn(async (url: string) => {
    this.currentUrl = url;
  });
  capturePage = vi.fn(async () => ({ toPNG: () => Buffer.from("png-evidence") }));
  executeJavaScript = vi.fn(async () => ({ ok: true }));
  getURL = vi.fn(() => this.currentUrl);
  isDestroyed = vi.fn(() => this.destroyed);
}

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  document.documentElement.innerHTML = "<head></head><body></body>";
  delete (globalThis as typeof globalThis & { __aurisBrowserRefStores?: unknown })
    .__aurisBrowserRefStores;
  await Promise.all(cleanup.splice(0).map((run) => run()));
});

async function inDocument(source: string, args: unknown) {
  const script = Function(`"use strict"; return (${source});`)();
  return script(args);
}

async function fixture(options: Record<string, unknown> = {}) {
  const webContents = new FakeWebContents();
  const evidenceDirectory = await mkdtemp(path.join(tmpdir(), "auris-executor-test-"));
  const isolatedCalls: Array<{ args: unknown; source: string }> = [];
  const isolatedRunner = vi.fn(async ({ args, source }: { args: unknown; source: string }) => {
    isolatedCalls.push({ args, source });
    return inDocument(source, args);
  });
  const executor = createBrowserPageExecutor({
    evidenceDirectory,
    getWebContents: () => webContents,
    isolatedRunner,
    ...options,
  });
  cleanup.push(async () => executor.cleanup());
  return { evidenceDirectory, executor, isolatedCalls, isolatedRunner, webContents };
}

function execute(executor: { execute(input: unknown): Promise<unknown> }, request: Record<string, unknown>, extra = {}) {
  return executor.execute({
    actionTimeoutMs: 1_000,
    control,
    request,
    signal: new AbortController().signal,
    tab: { navigationGeneration: 7, tabId: control.tabId },
    ...extra,
  });
}

describe("browser page executor fixed assets and observations", () => {
  it("loads fixed script assets from disk and passes selectors/text only as structured arguments", async () => {
    document.body.innerHTML = `<label for="topic">Topic</label><input id="topic"><button>Send</button>`;
    const { executor, isolatedCalls } = await fixture();
    await execute(executor, {
      action: "act",
      variant: "type",
      target: { kind: "selector", selector: "#topic" },
      text: "never-interpolate-this-secret",
    }, { approvedPayloadHash: "sha256:" + "a".repeat(64) }).catch(() => undefined);

    expect(Object.values(PAGE_SCRIPT_PATHS)).toHaveLength(3);
    for (const assetPath of Object.values(PAGE_SCRIPT_PATHS) as string[]) {
      expect((await readFile(assetPath, "utf8")).length).toBeGreaterThan(100);
    }
    expect(isolatedCalls).toHaveLength(1);
    expect(isolatedCalls[0]?.args).toMatchObject({
      target: { kind: "selector", selector: "#topic" },
      text: "never-interpolate-this-secret",
    });
    expect(isolatedCalls[0]?.source).not.toContain("#topic");
    expect(isolatedCalls[0]?.source).not.toContain("never-interpolate-this-secret");
  });

  it("reads bounded markdown and emits deterministic generation-scoped refs", async () => {
    document.title = "Research page";
    document.body.innerHTML = `<main><h1>Heading</h1><p>${"x".repeat(300_000)}</p><button>Continue</button></main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as Record<string, any>;

    expect(result.title).toBe("Heading");
    expect(result.markdown.length).toBeLessThanOrEqual(200_000);
    expect(result.truncated).toBe(true);
    expect(result.url).toBe("https://research.test/form");
    expect(result.generation).toBe(7);
    expect(result.nodes.find((node: any) => node.role === "button")).toMatchObject({
      generation: 7,
      ref: expect.stringMatching(/^g7:e\d+$/u),
    });
  });

  it("reuses clean-reader semantics for headings, links, code, and tables", async () => {
    document.body.innerHTML = `<main>
      <h1>Guide</h1>
      <p>Read <strong>carefully</strong> at <a href="/docs?q=visible">the docs</a>.</p>
      <pre>const answer = 42;</pre>
      <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>
    </main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.markdown).toContain("# Guide");
    expect(result.markdown).toContain("**carefully**");
    expect(result.markdown).toContain("[the docs](http://localhost:3000/docs?q=visible)");
    expect(result.markdown).toContain("```\nconst answer = 42;\n```");
    expect(result.markdown).toContain("| Name | Value |");
  });

  it("preserves byline, image, quote, rule, and dynamic code-fence semantics", async () => {
    document.body.innerHTML = `<main>
      <h1>Reader details</h1>
      <p class="byline">Ada Author</p>
      <img src="/diagram.png?version=1" alt="Diagram">
      <blockquote><p>Quoted source</p></blockquote>
      <hr>
      <p><code>a\`\`b</code></p>
      <pre>const fence = \`\`\`;</pre>
    </main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.byline).toBe("Ada Author");
    expect(result.markdown).toContain("![Diagram](http://localhost:3000/diagram.png?version=1)");
    expect(result.markdown).toContain("> Quoted source");
    expect(result.markdown).toContain("\n\n---\n\n");
    expect(result.markdown).toContain("```a\`\`b```");
    expect(result.markdown).toContain("````\nconst fence = ```;\n````");
  });

  it("deterministically truncates hostile node names within the aggregate read budget", async () => {
    document.body.innerHTML = `<main><h1>Large tree</h1>${Array.from(
      { length: 2_100 },
      (_, index) => `<button>${index}-${"汉".repeat(1_024)}</button>`,
    ).join("")}</main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(256 * 1_024);
  }, 30_000);

  it("budgets markdown by final JSON bytes after backslash and quote escaping", async () => {
    document.body.innerHTML = `<main><h1>Escaped tree</h1><p>${"\\\"".repeat(120_000)}</p></main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(256 * 1_024);
  });

  it("matches Phase 1 roles, accessible-name precedence, and title cleanup", async () => {
    document.title = "Research article | Example Site";
    document.body.innerHTML = `<main title="Research landmark">
      <img alt="Result diagram" src="/result.png">
      <input type="image" alt="Image action">
      <input type="range" aria-label="Confidence">
      <input type="number" placeholder="Count">
      <input type="search" value="ignored" placeholder="Find sources">
      <label>Wrapped topic <input type="text"></label>
      <input type="submit" value="Submit evidence">
      <select multiple aria-labelledby="selection-label"><option>One</option></select>
      <span id="selection-label">Sources</span>
    </main>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.title).toBe("Research article");
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Result diagram", role: "img" }),
      expect.objectContaining({ name: "Image action", role: "button" }),
      expect.objectContaining({ name: "Confidence", role: "slider" }),
      expect.objectContaining({ name: "Count", role: "spinbutton" }),
      expect.objectContaining({ name: "Find sources", role: "searchbox" }),
      expect.objectContaining({ name: "Wrapped topic", role: "textbox" }),
      expect.objectContaining({ name: "Submit evidence", role: "button" }),
      expect.objectContaining({ name: "Sources", role: "listbox" }),
    ]));
  });

  it("matches Phase 1 byline, dense-content, normalized-role, and heading semantics", async () => {
    document.title = "Fallback title | Site";
    document.body.innerHTML = `
      <header><span class="byline">Header Author</span></header>
      <div class="sidebar"><p>sidebar-secret</p></div>
      <section class="reader">
        <h1>Dense article</h1>
        <p>This is the substantially denser primary reading paragraph for the page.</p>
        <p>Another primary paragraph keeps this container ahead of the sidebar.</p>
        <div role="MAIN" title="Reader landmark"><span>descendant-secret</span></div>
        <div role="HeAdInG" aria-level="3">Explicit section</div>
      </section>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;

    expect(result.byline).toBe("Header Author");
    expect(result.markdown).toContain("substantially denser primary reading paragraph");
    expect(result.markdown).not.toContain("sidebar-secret");
    expect(result.markdown).not.toContain("Header Author");
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Reader landmark", role: "main" }),
      expect.objectContaining({ level: 3, role: "heading" }),
    ]));
    expect(JSON.stringify(result.nodes)).not.toContain("descendant-secret");
  });

  it("matches Phase 1 text escaping, global-title, presentation, and checked semantics", async () => {
    document.title = "Site fallback | Example Site";
    document.body.innerHTML = `
      <h1>Global headline</h1>
      <button role="none">Suppressed native button</button>
      <input type="checkbox" aria-label="Native unchecked" aria-checked="true">
      <div role="checkbox" aria-checked="true">ARIA checked</div>
      <section>
        <p># Not a heading</p>
        <p>1. Not a list</p>
      </section>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;

    expect(result.title).toBe("Global headline");
    expect(result.markdown).toContain("\\# Not a heading");
    expect(result.markdown).toContain("1\\. Not a list");
    expect(result.nodes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Suppressed native button" }),
    ]));
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ checked: false, name: "Native unchecked", role: "checkbox" }),
      expect.objectContaining({ checked: true, name: "ARIA checked", role: "checkbox" }),
    ]));
  });

  it("keeps the Phase 1 body fallback for useful pages without paragraphs", async () => {
    document.body.innerHTML = `
      <header>header-noise</header>
      <div><h2>Reference index</h2><blockquote>Useful body without paragraph tags</blockquote></div>`;
    const { executor } = await fixture();
    const result = await execute(executor, { action: "read" }) as any;
    expect(result.markdown).toContain("Reference index");
    expect(result.markdown).toContain("Useful body without paragraph tags");
    expect(result.markdown).not.toContain("header-noise");
  });

  it("queries visible targets and rejects old refs on another tab or generation", async () => {
    document.body.innerHTML = `<main><button id="go">Go</button></main>`;
    const { executor } = await fixture();
    const found = await execute(executor, {
      action: "query",
      target: { kind: "selector", selector: "#go" },
    }) as Record<string, any>;
    expect(found).toMatchObject({ found: true, generation: 7, ref: "g7:e1" });

    await expect(executor.execute({
      actionTimeoutMs: 1_000,
      control: { ...control, navigationGeneration: 8 },
      request: { action: "query", target: { kind: "ref", ref: found.ref } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 8, tabId: control.tabId },
    })).rejects.toMatchObject({ code: "STALE_NAVIGATION" });
    await expect(executor.execute({
      actionTimeoutMs: 1_000,
      control: { ...control, tabId: "tab-two" },
      request: { action: "query", target: { kind: "ref", ref: found.ref } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: "tab-two" },
    })).rejects.toMatchObject({ code: "STALE_NAVIGATION" });
  });

  it("wait_for observes delayed visible content without parking beyond its bound", async () => {
    document.body.innerHTML = `<div id="later" hidden>Ready</div>`;
    setTimeout(() => document.querySelector("#later")?.removeAttribute("hidden"), 10);
    const { executor } = await fixture();
    await expect(execute(executor, {
      action: "wait_for",
      target: { kind: "selector", selector: "#later" },
      timeoutMs: 200,
    })).resolves.toMatchObject({ found: true });
    await expect(execute(executor, {
      action: "wait_for",
      target: { kind: "selector", selector: "#missing" },
      timeoutMs: 5,
    })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("browser page executor actions", () => {
  it("navigates and waits using bounded cancellable operations", async () => {
    const { executor, webContents } = await fixture();
    await expect(execute(executor, {
      action: "navigate",
      url: "https://research.test/next",
    })).resolves.toEqual({ navigated: true, url: "https://research.test/next" });
    expect(webContents.loadURL).toHaveBeenCalledWith("https://research.test/next");
    await expect(execute(executor, { action: "wait", milliseconds: 1 }))
      .resolves.toEqual({ waitedMs: 1 });

    const cancelled = new AbortController();
    const pending = executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "wait", milliseconds: 500 },
      signal: cancelled.signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    cancelled.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("stops a timed-out or cancelled native navigation before rejecting", async () => {
    const { executor, webContents } = await fixture();
    webContents.stop = vi.fn();
    webContents.loadURL.mockImplementation(() => new Promise(() => undefined));
    await expect(execute(executor, {
      action: "navigate",
      url: "https://research.test/hang",
    }, { actionTimeoutMs: 5 })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(webContents.stop).toHaveBeenCalledOnce();

    const cancelled = new AbortController();
    const pending = executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "navigate", url: "https://research.test/cancel" },
      signal: cancelled.signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    await vi.waitFor(() => {
      expect(webContents.loadURL).toHaveBeenCalledWith("https://research.test/cancel");
    });
    cancelled.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(webContents.stop).toHaveBeenCalledTimes(2);
  });

  it("maps native navigation, adapter, abort, and page-asset failures to safe public errors", async () => {
    const navigation = await fixture();
    navigation.webContents.loadURL.mockRejectedValue(new Error("loadURL secret raw message"));
    const navigationError = await execute(navigation.executor, {
      action: "navigate",
      url: "https://research.test/fail",
    }).catch((error) => error);
    expect(navigationError).toMatchObject({ code: "NAVIGATION_BLOCKED" });
    expect(JSON.stringify(navigationError)).not.toContain("secret raw message");

    for (const action of ["close", "focus"] as const) {
      const adapter = await fixture({
        [`${action}Target`]: vi.fn().mockRejectedValue(new Error(`${action} secret raw message`)),
      });
      const error = await execute(adapter.executor, { action }).catch((caught) => caught);
      expect(error).toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
      expect(JSON.stringify(error)).not.toContain("secret raw message");
    }

    const aborted = await fixture({
      isolatedRunner: vi.fn().mockRejectedValue(new DOMException("abort secret", "AbortError")),
    });
    await expect(execute(aborted.executor, { action: "read" }))
      .rejects.toMatchObject({ code: "CANCELLED" });

    const assets = await fixture({
      pageScriptLoader: vi.fn().mockRejectedValue(new Error("asset path secret")),
    });
    const assetError = await execute(assets.executor, { action: "read" }).catch((error) => error);
    expect(assetError).toMatchObject({
      code: "CAPABILITY_NOT_VERIFIED",
      metadata: { capability: "browser-page-assets" },
    });
    expect(JSON.stringify(assetError)).not.toContain("asset path secret");

    const hangingAssets = await fixture({
      pageScriptLoader: vi.fn(() => new Promise(() => undefined)),
    });
    const assetCancellation = new AbortController();
    const pendingAssetLoad = hangingAssets.executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "read" },
      signal: assetCancellation.signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    assetCancellation.abort();
    await expect(pendingAssetLoad).rejects.toMatchObject({ code: "CANCELLED" });

    const trusted = createBrowserPublicError("STALE_NAVIGATION");
    const preserving = await fixture({ isolatedRunner: vi.fn().mockRejectedValue(trusted) });
    await expect(execute(preserving.executor, { action: "read" })).rejects.toBe(trusted);

    const forged = await fixture({
      isolatedRunner: vi.fn().mockRejectedValue({
        code: "PAGE_CRASHED",
        message: "forged raw secret",
      }),
    });
    const forgedError = await execute(forged.executor, { action: "read" })
      .catch((error) => error);
    expect(forgedError).toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    expect(JSON.stringify(forgedError)).not.toContain("forged raw secret");
  });

  it("aborts close and focus adapters and waits for terminal cleanup before rejecting", async () => {
    let closeSideEffects = 0;
    const closeTarget = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        closeSideEffects += 1;
        resolve(true);
      }, 40);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    }));
    const closing = await fixture({ closeTarget });
    await expect(execute(closing.executor, { action: "close" }, { actionTimeoutMs: 5 }))
      .rejects.toMatchObject({ code: "TIMEOUT" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closeSideEffects).toBe(0);

    let focusSideEffects = 0;
    let markFocusStarted!: () => void;
    const focusStarted = new Promise<void>((resolve) => { markFocusStarted = resolve; });
    const focusTarget = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise((resolve, reject) => {
      markFocusStarted();
      const timer = setTimeout(() => {
        focusSideEffects += 1;
        resolve({ focused: true });
      }, 40);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    }));
    const focusing = await fixture({ focusTarget });
    const cancelled = new AbortController();
    const pending = focusing.executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "focus" },
      signal: cancelled.signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    await focusStarted;
    cancelled.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(focusSideEffects).toBe(0);
  });

  it("bounds adapter cancellation cleanup when a trusted adapter never settles", async () => {
    const closeTarget = vi.fn(() => new Promise(() => undefined));
    const { executor } = await fixture({ closeTarget });
    const boundary = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("adapter grace exceeded")), 500);
    });
    await expect(Promise.race([
      execute(executor, { action: "close" }, { actionTimeoutMs: 5 }),
      boundary,
    ])).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("clears both deadline and delay timers when a wait is cancelled", async () => {
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const { executor } = await fixture();
    const cancelled = new AbortController();
    const pending = executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "wait", milliseconds: 500 },
      signal: cancelled.signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    await vi.waitFor(() => {
      expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 500);
    });
    cancelled.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(clearTimer.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("clicks, types, scrolls, keys, and styles only visible enabled connected targets", async () => {
    document.body.innerHTML = `
      <button id="click">Click</button>
      <input id="type">
      <button id="hidden" hidden>Hidden</button>
      <button id="disabled" disabled>Disabled</button>
      <div id="style"></div>`;
    const click = vi.fn();
    vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    document.querySelector("#click")?.addEventListener("click", click);
    const { executor } = await fixture();

    await expect(execute(executor, { action: "act", variant: "click", target: { kind: "selector", selector: "#click" } }))
      .resolves.toMatchObject({ acted: true, variant: "click" });
    expect(click).toHaveBeenCalledOnce();
    await execute(executor, { action: "act", variant: "type", target: { kind: "selector", selector: "#type" }, text: "hello" });
    expect((document.querySelector("#type") as HTMLInputElement).value).toBe("hello");
    await expect(execute(executor, { action: "act", variant: "scroll", deltaY: 20 }))
      .resolves.toMatchObject({ acted: true, variant: "scroll" });
    await expect(execute(executor, { action: "act", variant: "key", key: "Enter" }))
      .resolves.toMatchObject({ acted: true, variant: "key" });

    const styleRequest = { action: "style", target: { kind: "selector", selector: "#style" }, css: "color: red" };
    await expect(execute(executor, styleRequest, { approvedPayloadHash: "sha256:" + "0".repeat(64) }))
      .rejects.toMatchObject({ code: "PAYLOAD_MISMATCH" });
    const exactHash = hashBrowserExecutorPayload(styleRequest);
    await expect(execute(executor, styleRequest, { approvedPayloadHash: exactHash }))
      .resolves.toMatchObject({ acted: true, variant: "style" });
    expect((document.querySelector("#style") as HTMLElement).style.color).toBe("red");

    await expect(execute(executor, { action: "act", variant: "click", target: { kind: "selector", selector: "#hidden" } }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    await expect(execute(executor, { action: "act", variant: "click", target: { kind: "selector", selector: "#disabled" } }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    const detached = document.querySelector("#click")!;
    const queried = await execute(executor, { action: "query", target: { kind: "selector", selector: "#click" } }) as any;
    detached.remove();
    await expect(execute(executor, { action: "act", variant: "click", target: { kind: "ref", ref: queried.ref } }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
  });

  it("rejects timeout, oversized output, and navigation during an action", async () => {
    const { executor } = await fixture({
      isolatedRunner: vi.fn(async () => new Promise(() => undefined)),
    });
    await expect(execute(executor, { action: "read" }, { actionTimeoutMs: 5 }))
      .rejects.toMatchObject({ code: "TIMEOUT" });

    const oversized = await fixture({
      isolatedRunner: vi.fn(async () => ({ markdown: "x".repeat(300_000) })),
    });
    await expect(execute(oversized.executor, { action: "read" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });

    const navigating = await fixture();
    navigating.isolatedRunner.mockImplementation(async () => {
      navigating.webContents.currentUrl = "https://research.test/changed";
      return { found: true };
    });
    await expect(execute(navigating.executor, {
      action: "query",
      target: { kind: "selector", selector: "main" },
    })).rejects.toMatchObject({ code: "STALE_NAVIGATION" });
  });
});

describe("browser page executor console, screenshot, and internal eval", () => {
  it("buffers a bounded main-process console view and strips URL credentials", async () => {
    const { executor, webContents } = await fixture();
    const unregister = executor.registerTarget({
      control,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    for (let index = 0; index < 250; index += 1) {
      webContents.emit("console-message", {}, "error", `entry-${index}-${"x".repeat(2_000)}`, 1,
        "https://user:password@research.test/app?secret=value");
    }
    const result = await execute(executor, { action: "console", level: "error" }) as any;
    expect(result.entries.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("secret=value");
    expect(result.entries.at(-1).source).toBe("https://research.test/app");
    expect(result.entries.at(-1).message.length).toBeLessThanOrEqual(1_024);
    unregister();
  });

  it("clears console and ref authority when the same tab enters a new generation", async () => {
    document.body.innerHTML = `<button id="old">Old</button><button id="next">Next</button>`;
    const { executor, webContents } = await fixture();
    executor.registerTarget({ control, tab: { navigationGeneration: 7, tabId: control.tabId } });
    const old = await execute(executor, {
      action: "query",
      target: { kind: "selector", selector: "#old" },
    }) as any;
    webContents.emit("console-message", {}, {
      level: "info",
      lineNumber: 2,
      message: "old-document-message",
      sourceId: "https://research.test/old?private=1",
    });

    const nextControl = { ...control, navigationGeneration: 8 };
    const nextTab = { navigationGeneration: 8, tabId: control.tabId };
    executor.registerTarget({ control: nextControl, tab: nextTab });
    const nextConsole = await executor.execute({
      actionTimeoutMs: 1_000,
      control: nextControl,
      request: { action: "console" },
      signal: new AbortController().signal,
      tab: nextTab,
    }) as any;
    expect(nextConsole.entries).toEqual([]);
    await expect(executor.execute({
      actionTimeoutMs: 1_000,
      control: nextControl,
      request: { action: "query", target: { kind: "ref", ref: old.ref } },
      signal: new AbortController().signal,
      tab: nextTab,
    })).rejects.toMatchObject({ code: "STALE_NAVIGATION" });
  });

  it("bounds same-generation page refs and main authority with deterministic FIFO eviction", async () => {
    const { executor } = await fixture({ maxScopeRefs: 3 });
    const refs: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      document.body.innerHTML = `<button>Dynamic ${index}</button>`;
      const found = await execute(executor, {
        action: "query",
        target: { kind: "selector", selector: "button" },
      }) as any;
      refs.push(found.ref);
    }
    const stores = (globalThis as any).__aurisBrowserRefStores as Map<string, any>;
    const store = Array.from(stores.values())[0];
    expect(store.byRef.size).toBeLessThanOrEqual(3);
    await expect(execute(executor, {
      action: "query",
      target: { kind: "ref", ref: refs[0] },
    })).rejects.toMatchObject({ code: "STALE_NAVIGATION" });
    await expect(execute(executor, {
      action: "query",
      target: { kind: "ref", ref: refs.at(-1) },
    })).resolves.toMatchObject({ found: true, ref: refs.at(-1) });
  });

  it("keeps connected ref allocation bounded after repeatedly crossing the scope cap", async () => {
    document.body.innerHTML = Array.from(
      { length: 256 },
      (_, index) => `<button id="connected-${index}">Connected ${index}</button>`,
    ).join("");
    const { executor } = await fixture({ maxScopeRefs: 64 });
    for (let index = 0; index < 256; index += 1) {
      await execute(executor, {
        action: "query",
        target: { kind: "selector", selector: `#connected-${index}` },
      });
    }
    const stores = (globalThis as any).__aurisBrowserRefStores as Map<string, any>;
    const store = Array.from(stores.values())[0];
    expect(store.byRef.size).toBe(64);
    expect(store.order.size).toBe(64);
  });

  it("evicts the least-recently-used target listener at the executor target cap", async () => {
    const first = new FakeWebContents();
    const second = new FakeWebContents();
    const executor = createBrowserPageExecutor({
      getWebContents: ({ tabId }: { tabId: string }) => tabId === "tab-one" ? first : second,
      isolatedRunner: vi.fn(),
      maxActiveTargets: 1,
    });
    cleanup.push(async () => executor.cleanup());
    executor.registerTarget({ control, tab: { navigationGeneration: 7, tabId: "tab-one" } });
    expect(first.listenerCount("console-message")).toBe(1);
    const secondControl = { ...control, tabId: "tab-two" };
    executor.registerTarget({
      control: secondControl,
      tab: { navigationGeneration: 7, tabId: "tab-two" },
    });
    expect(first.listenerCount("console-message")).toBe(0);
    expect(second.listenerCount("console-message")).toBe(1);
  });

  it("writes screenshots to random owner-only evidence files and cleans them up", async () => {
    const { executor, evidenceDirectory } = await fixture();
    const first = await execute(executor, { action: "screenshot" }) as any;
    const second = await execute(executor, { action: "screenshot" }) as any;
    expect(first).toMatchObject({ evidenceRef: expect.stringMatching(/^screenshot-[0-9a-f]{32}$/u) });
    expect(first.evidenceRef).not.toBe(second.evidenceRef);
    const firstPath = executor.resolveEvidencePath(first.evidenceRef);
    expect(path.dirname(firstPath)).toBe(evidenceDirectory);
    expect(await readFile(firstPath, "utf8")).toBe("png-evidence");
    expect((await stat(firstPath)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(first)).not.toContain("cG5n");
    expect(JSON.stringify(first)).not.toContain(evidenceDirectory);
    await executor.cleanup();
    await expect(stat(firstPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects oversized screenshots and capture results from a navigated document", async () => {
    const oversized = await fixture();
    oversized.webContents.capturePage.mockResolvedValue({
      toPNG: () => Buffer.alloc((16 * 1_024 * 1_024) + 1),
    });
    await expect(execute(oversized.executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });

    const navigating = await fixture();
    navigating.webContents.capturePage.mockImplementation(async () => {
      navigating.webContents.currentUrl = "https://research.test/after-capture";
      return { toPNG: () => Buffer.from("late") };
    });
    await expect(execute(navigating.executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "STALE_NAVIGATION" });
  });

  it("maps capture, evidence filesystem, and CDP failures without leaking raw messages", async () => {
    const capture = await fixture();
    capture.webContents.capturePage.mockRejectedValue(new Error("capture secret raw message"));
    const captureError = await execute(capture.executor, { action: "screenshot" })
      .catch((error) => error);
    expect(captureError).toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    expect(JSON.stringify(captureError)).not.toContain("secret raw message");

    const parent = await mkdtemp(path.join(tmpdir(), "auris-evidence-file-"));
    const notDirectory = path.join(parent, "not-a-directory");
    await writeFile(notDirectory, "file");
    const filesystem = await fixture({ evidenceDirectory: notDirectory });
    const filesystemError = await execute(filesystem.executor, { action: "screenshot" })
      .catch((error) => error);
    expect(filesystemError).toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    expect(JSON.stringify(filesystemError)).not.toContain("ENOTDIR");
    await unlink(notDirectory);
    await rmdir(parent);

    const cdpWebContents = new FakeWebContents() as FakeWebContents & { debugger: any };
    cdpWebContents.debugger = {
      attach: vi.fn(),
      detach: vi.fn(),
      isAttached: vi.fn(() => true),
      sendCommand: vi.fn().mockRejectedValue(new Error("CDP secret raw message")),
    };
    const cdpExecutor = createBrowserPageExecutor({ getWebContents: () => cdpWebContents });
    cleanup.push(async () => cdpExecutor.cleanup());
    const cdpError = await execute(cdpExecutor, {
      action: "query",
      target: { kind: "selector", selector: "main" },
    }).catch((error) => error);
    expect(cdpError).toMatchObject({ code: "PAGE_CRASHED" });
    expect(JSON.stringify(cdpError)).not.toContain("secret raw message");
  });

  it("creates and removes a random executor-owned evidence directory by default", async () => {
    const webContents = new FakeWebContents();
    const executor = createBrowserPageExecutor({
      getWebContents: () => webContents,
      isolatedRunner: vi.fn(),
    });
    const shot = await execute(executor, { action: "screenshot" }) as any;
    const filePath = executor.resolveEvidencePath(shot.evidenceRef);
    const directory = path.dirname(filePath);
    expect(path.basename(directory)).toMatch(/^auris-browser-evidence-[A-Za-z0-9]+$/u);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    await executor.cleanup();
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("bounds the evidence inventory and restores capacity after explicit release", async () => {
    const { executor } = await fixture({
      maxEvidenceFiles: 1,
      maxEvidenceTotalBytes: 32,
    });
    const first = await execute(executor, { action: "screenshot" }) as any;
    await expect(execute(executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    await expect(executor.releaseEvidence(first.evidenceRef)).resolves.toBe(true);
    await expect(execute(executor, { action: "screenshot" }))
      .resolves.toMatchObject({ evidenceRef: expect.any(String) });

    const bytes = await fixture({ maxEvidenceTotalBytes: 5 });
    await expect(execute(bytes.executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    expect(bytes.executor.resolveEvidencePath("screenshot-" + "0".repeat(32))).toBeNull();
  });

  it("atomically limits concurrent screenshots and owns exactly one lazy evidence directory", async () => {
    const before = new Set((await readdir(tmpdir()))
      .filter((name) => name.startsWith("auris-browser-evidence-")));
    const webContents = new FakeWebContents();
    const executor = createBrowserPageExecutor({
      getWebContents: () => webContents,
      maxEvidenceFiles: 1,
    });
    let ownedDirectory = "";
    try {
      const results = await Promise.allSettled([
        execute(executor, { action: "screenshot" }),
        execute(executor, { action: "screenshot" }),
        execute(executor, { action: "screenshot" }),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      expect(rejected.every((result: any) =>
        result.reason?.code === "OPERATION_NOT_ALLOWED")).toBe(true);
      const shot = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      ownedDirectory = path.dirname(executor.resolveEvidencePath(shot.evidenceRef));
      const added = (await readdir(tmpdir())).filter((name) =>
        name.startsWith("auris-browser-evidence-") && !before.has(name));
      expect(added).toEqual([path.basename(ownedDirectory)]);
    } finally {
      await executor.cleanup();
    }
    await expect(stat(ownedDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    const remaining = (await readdir(tmpdir())).filter((name) =>
      name.startsWith("auris-browser-evidence-") && !before.has(name));
    expect(remaining).toEqual([]);
    await expect(execute(executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
  });

  it("retains evidence quota when release cannot delete the owned file", async () => {
    let deletionFails = true;
    const unlinkFile = vi.fn(async (filePath: string) => {
      if (deletionFails) throw Object.assign(new Error("unlink secret"), { code: "EIO" });
      await unlink(filePath);
    });
    const { executor } = await fixture({ maxEvidenceFiles: 1, unlinkFile });
    const first = await execute(executor, { action: "screenshot" }) as any;
    await expect(executor.releaseEvidence(first.evidenceRef))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    await expect(execute(executor, { action: "screenshot" }))
      .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    deletionFails = false;
    await expect(executor.releaseEvidence(first.evidenceRef)).resolves.toBe(true);
  });

  it("tracks a post-write cancelled file when rollback unlink fails", async () => {
    const cancelled = new AbortController();
    let deletionFails = true;
    const unlinkFile = vi.fn(async (filePath: string) => {
      if (deletionFails) throw Object.assign(new Error("unlink secret"), { code: "EIO" });
      await unlink(filePath);
    });
    const writeEvidenceFile = vi.fn(async (filePath: string, data: Buffer) => {
      await writeFile(filePath, data, { flag: "wx", mode: 0o600 });
      cancelled.abort();
    });
    const { executor } = await fixture({
      maxEvidenceFiles: 1,
      unlinkFile,
      writeEvidenceFile,
    });
    try {
      await expect(executor.execute({
        actionTimeoutMs: 1_000,
        control,
        request: { action: "screenshot" },
        signal: cancelled.signal,
        tab: { navigationGeneration: 7, tabId: control.tabId },
      })).rejects.toMatchObject({ code: "CANCELLED" });
      await expect(execute(executor, { action: "screenshot" }))
        .rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
    } finally {
      deletionFails = false;
    }
    await expect(executor.cleanup()).resolves.toBeUndefined();
  });

  it("counts evidence-queue time against one action deadline and never writes an expired shot", async () => {
    let releaseFirstWrite!: () => void;
    let markFirstWriteStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve; });
    const firstWrite = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    let calls = 0;
    const writeEvidenceFile = vi.fn(async (filePath: string, data: Buffer) => {
      calls += 1;
      if (calls === 1) {
        markFirstWriteStarted();
        await firstWrite;
      }
      await writeFile(filePath, data, { flag: "wx", mode: 0o600 });
    });
    const { executor } = await fixture({ maxEvidenceFiles: 2, writeEvidenceFile });
    const first = executor.execute({
      actionTimeoutMs: 1_000,
      control,
      request: { action: "screenshot" },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    await firstWriteStarted;
    const expired = executor.execute({
      actionTimeoutMs: 5,
      control,
      request: { action: "screenshot" },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    });
    await expect(expired).rejects.toMatchObject({ code: "TIMEOUT" });
    releaseFirstWrite();
    const firstShot = await first as any;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(writeEvidenceFile).toHaveBeenCalledOnce();
    await expect(executor.releaseEvidence(firstShot.evidenceRef)).resolves.toBe(true);
    await expect(execute(executor, { action: "screenshot" }))
      .resolves.toMatchObject({ evidenceRef: expect.any(String) });
    expect(writeEvidenceFile).toHaveBeenCalledTimes(2);
  });

  it("waits for a timed-out lazy directory initialization before cleanup completes", async () => {
    let releaseDirectory!: () => void;
    let markDirectoryStarted!: () => void;
    const directoryStarted = new Promise<void>((resolve) => { markDirectoryStarted = resolve; });
    const directoryGate = new Promise<void>((resolve) => { releaseDirectory = resolve; });
    let createdDirectory = "";
    const makeEvidenceDirectory = vi.fn(async (prefix: string) => {
      markDirectoryStarted();
      await directoryGate;
      createdDirectory = await mkdtemp(prefix);
      return createdDirectory;
    });
    const executor = createBrowserPageExecutor({
      getWebContents: () => new FakeWebContents(),
      makeEvidenceDirectory,
    });
    const shot = execute(executor, { action: "screenshot" }, { actionTimeoutMs: 5 });
    await directoryStarted;
    await expect(shot).rejects.toMatchObject({ code: "TIMEOUT" });
    const cleaning = executor.cleanup();
    releaseDirectory();
    await expect(cleaning).resolves.toBeUndefined();
    expect(makeEvidenceDirectory).toHaveBeenCalledOnce();
    await expect(stat(createdDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("settles and removes an abort-ignoring late write before returning timeout", async () => {
    let releaseWrite!: () => void;
    let markWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => { markWriteStarted = resolve; });
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    let calls = 0;
    const writeEvidenceFile = vi.fn(async (filePath: string, data: Buffer) => {
      calls += 1;
      if (calls === 1) {
        markWriteStarted();
        await writeGate;
      }
      await writeFile(filePath, data, { flag: "wx", mode: 0o600 });
    });
    const { evidenceDirectory, executor } = await fixture({ writeEvidenceFile });
    const shot = execute(executor, { action: "screenshot" }, { actionTimeoutMs: 5 });
    let settled = false;
    void shot.finally(() => { settled = true; }).catch(() => undefined);
    await writeStarted;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    releaseWrite();
    await expect(shot).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(await readdir(evidenceDirectory)).toEqual([]);
    await expect(execute(executor, { action: "screenshot" }))
      .resolves.toMatchObject({ evidenceRef: expect.any(String) });
  }, 30_000);

  it("executes bounded caller code in the page world only with its exact approved hash", async () => {
    const pageWorldRunner = vi.fn(async () => ({ ok: true }));
    const { executor, isolatedRunner, webContents } = await fixture({ pageWorldRunner });
    const request = { action: "execute_js", source: "document.title" };
    const exactHash = hashBrowserExecutorPayload(request);
    await expect(execute(executor, request, { approvedPayloadHash: "sha256:" + "f".repeat(64) }))
      .rejects.toMatchObject({ code: "PAYLOAD_MISMATCH" });
    await expect(execute(executor, request, { approvedPayloadHash: exactHash }))
      .resolves.toEqual({ value: { ok: true } });
    expect(pageWorldRunner).toHaveBeenCalledWith(expect.objectContaining({
      source: "document.title",
      webContents,
    }));
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
    expect(isolatedRunner).not.toHaveBeenCalled();
  });

  it("uses a top-frame CDP isolated world, serializes calls, and preserves pre-attached debugger ownership", async () => {
    const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
    let active = 0;
    let maximumActive = 0;
    const debuggerApi = {
      attach: vi.fn(),
      detach: vi.fn(),
      isAttached: vi.fn(() => true),
      sendCommand: vi.fn(async (method: string, params?: Record<string, any>) => {
        if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top-frame" } } };
        if (method === "Page.createIsolatedWorld") return { executionContextId: 41 };
        if (method === "Runtime.callFunctionOn") {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          expect(params?.arguments).toEqual([{ value: expect.any(Object) }]);
          expect(params?.functionDeclaration).not.toContain("#private-selector");
          return { result: { value: { found: false } } };
        }
        return {};
      }),
    };
    webContents.debugger = debuggerApi;
    const evidenceDirectory = await mkdtemp(path.join(tmpdir(), "auris-cdp-test-"));
    const executor = createBrowserPageExecutor({ evidenceDirectory, getWebContents: () => webContents });
    cleanup.push(async () => executor.cleanup());
    const input = {
      actionTimeoutMs: 1_000,
      control,
      request: { action: "query", target: { kind: "selector", selector: "#private-selector" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    };
    await Promise.all([executor.execute(input), executor.execute(input)]);
    expect(maximumActive).toBe(1);
    expect(debuggerApi.sendCommand).toHaveBeenCalledWith("Page.createIsolatedWorld", {
      frameId: "top-frame",
      grantUniveralAccess: false,
      worldName: "AurisBrowserAutomation",
    });
    expect(debuggerApi.sendCommand.mock.calls.filter(([method]) =>
      method === "Page.createIsolatedWorld")).toHaveLength(1);
    await executor.cleanup();
    expect(debuggerApi.attach).not.toHaveBeenCalled();
    expect(debuggerApi.detach).not.toHaveBeenCalled();
  });

  it("releases executor-owned debuggers on LRU eviction, tab close, and window close", async () => {
    const contents = new Map<string, FakeWebContents & { debugger: any }>();
    const makeContents = (tabId: string) => {
      const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
      let attached = false;
      webContents.debugger = {
        attach: vi.fn(() => { attached = true; }),
        detach: vi.fn(() => { attached = false; }),
        isAttached: vi.fn(() => attached),
        sendCommand: vi.fn(async (method: string) => {
          if (method === "Page.getFrameTree") return { frameTree: { frame: { id: tabId } } };
          if (method === "Page.createIsolatedWorld") return { executionContextId: 9 };
          if (method === "Runtime.callFunctionOn") return { result: { value: { found: false } } };
          if (method === "Runtime.terminateExecution") return {};
          return {};
        }),
      };
      contents.set(tabId, webContents);
      return webContents;
    };
    const first = makeContents("tab-one");
    const second = makeContents("tab-two");
    const third = makeContents("tab-three");
    const executor = createBrowserPageExecutor({
      getWebContents: ({ tabId }: { tabId: string }) => contents.get(tabId),
      maxActiveTargets: 1,
    });
    cleanup.push(async () => executor.cleanup());
    const query = (tabId: string) => executor.execute({
      actionTimeoutMs: 1_000,
      control: { ...control, tabId },
      request: { action: "query", target: { kind: "selector", selector: "main" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId },
    });

    await query("tab-one");
    await query("tab-two");
    await vi.waitFor(() => expect(first.debugger.detach).toHaveBeenCalledOnce());
    await executor.tabClosed("window-one", "tab-two");
    await vi.waitFor(() => expect(second.debugger.detach).toHaveBeenCalledOnce());
    await query("tab-three");
    await executor.windowClosed("window-one");
    await vi.waitFor(() => expect(third.debugger.detach).toHaveBeenCalledOnce());
    await executor.cleanup();
    expect(first.debugger.detach).toHaveBeenCalledOnce();
    expect(second.debugger.detach).toHaveBeenCalledOnce();
    expect(third.debugger.detach).toHaveBeenCalledOnce();
  });

  it("tombstones active and queued CDP work when a tab closes", async () => {
    const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
    let attached = false;
    let rejectActive!: (error: Error) => void;
    let markActive!: () => void;
    const activeStarted = new Promise<void>((resolve) => { markActive = resolve; });
    let calls = 0;
    webContents.debugger = {
      attach: vi.fn(() => { attached = true; }),
      detach: vi.fn(() => { attached = false; }),
      isAttached: vi.fn(() => attached),
      sendCommand: vi.fn(async (method: string) => {
        if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } };
        if (method === "Page.createIsolatedWorld") return { executionContextId: 17 };
        if (method === "Runtime.callFunctionOn") {
          calls += 1;
          if (calls === 1) {
            markActive();
            return new Promise((_, reject) => { rejectActive = reject; });
          }
          return { result: { value: { found: false } } };
        }
        if (method === "Runtime.terminateExecution") {
          rejectActive(new Error("target retired"));
          return {};
        }
        return {};
      }),
    };
    const executor = createBrowserPageExecutor({ getWebContents: () => webContents });
    cleanup.push(async () => executor.cleanup());
    const input = {
      actionTimeoutMs: 1_000,
      control,
      request: { action: "query", target: { kind: "selector", selector: "main" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    };
    const active = executor.execute(input);
    await activeStarted;
    const queued = executor.execute(input);
    await executor.tabClosed(control.windowId, control.tabId);

    await expect(active).rejects.toMatchObject({ code: "PAGE_CRASHED" });
    await expect(queued).rejects.toMatchObject({ code: "PAGE_CRASHED" });
    await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });
    expect(webContents.debugger.attach).toHaveBeenCalledOnce();
    expect(webContents.debugger.detach).toHaveBeenCalledOnce();
    expect(attached).toBe(false);
  });

  it.each(["tab", "window"])(
    "retains lifecycle authority when LRU eviction precedes %s close",
    async (terminalKind) => {
      const first = new FakeWebContents() as FakeWebContents & { debugger: any };
      const second = new FakeWebContents();
      let attached = false;
      let releaseActive!: () => void;
      let markActive!: () => void;
      const activeStarted = new Promise<void>((resolve) => { markActive = resolve; });
      const activeResult = new Promise<void>((resolve) => { releaseActive = resolve; });
      let calls = 0;
      first.debugger = {
        attach: vi.fn(() => { attached = true; }),
        detach: vi.fn(() => { attached = false; }),
        isAttached: vi.fn(() => attached),
        sendCommand: vi.fn(async (method: string) => {
          if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } };
          if (method === "Page.createIsolatedWorld") return { executionContextId: 21 };
          if (method === "Runtime.callFunctionOn") {
            calls += 1;
            if (calls === 1) {
              markActive();
              await activeResult;
            }
            return { result: { value: { found: false } } };
          }
          if (method === "Runtime.terminateExecution") {
            releaseActive();
            return {};
          }
          return {};
        }),
      };
      const executor = createBrowserPageExecutor({
        getWebContents: ({ tabId }: { tabId: string }) => tabId === "tab-one" ? first : second,
        maxActiveTargets: 1,
      });
      cleanup.push(async () => executor.cleanup());
      const input = {
        actionTimeoutMs: 1_000,
        control,
        request: { action: "query", target: { kind: "selector", selector: "main" } },
        signal: new AbortController().signal,
        tab: { navigationGeneration: 7, tabId: control.tabId },
      };
      const active = executor.execute(input);
      await activeStarted;
      const queued = executor.execute(input);
      executor.registerTarget({
        control: { ...control, tabId: "tab-two" },
        tab: { navigationGeneration: 7, tabId: "tab-two" },
      });

      if (terminalKind === "tab") await executor.tabClosed(control.windowId, control.tabId);
      else await executor.windowClosed(control.windowId);
      releaseActive();

      await expect(active).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      await expect(queued).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      expect(first.debugger.attach).toHaveBeenCalledOnce();
      expect(first.debugger.detach).toHaveBeenCalledOnce();
      await executor.cleanup();
      expect(first.debugger.detach).toHaveBeenCalledOnce();
      expect(attached).toBe(false);
    },
  );

  it.each(["tab", "window"])(
    "retires pre-attached active and queued work after LRU eviction and %s close",
    async (terminalKind) => {
      const first = new FakeWebContents() as FakeWebContents & { debugger: any };
      const second = new FakeWebContents();
      let releaseActive!: () => void;
      let markActive!: () => void;
      const activeStarted = new Promise<void>((resolve) => { markActive = resolve; });
      const activeResult = new Promise<void>((resolve) => { releaseActive = resolve; });
      let calls = 0;
      first.debugger = {
        attach: vi.fn(),
        detach: vi.fn(),
        isAttached: vi.fn(() => true),
        sendCommand: vi.fn(async (method: string) => {
          if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "external" } } };
          if (method === "Page.createIsolatedWorld") return { executionContextId: 31 };
          if (method === "Runtime.callFunctionOn") {
            calls += 1;
            if (calls === 1) {
              markActive();
              await activeResult;
            }
            return { result: { value: { found: false } } };
          }
          return {};
        }),
      };
      const executor = createBrowserPageExecutor({
        getWebContents: ({ tabId }: { tabId: string }) => tabId === "tab-one" ? first : second,
        maxActiveTargets: 1,
      });
      cleanup.push(async () => executor.cleanup());
      const input = {
        actionTimeoutMs: 1_000,
        control,
        request: { action: "query", target: { kind: "selector", selector: "main" } },
        signal: new AbortController().signal,
        tab: { navigationGeneration: 7, tabId: control.tabId },
      };
      const active = executor.execute(input);
      await activeStarted;
      const queued = executor.execute(input);
      executor.registerTarget({
        control: { ...control, tabId: "tab-two" },
        tab: { navigationGeneration: 7, tabId: "tab-two" },
      });
      await Promise.resolve();
      await Promise.resolve();

      if (terminalKind === "tab") await executor.tabClosed(control.windowId, control.tabId);
      else await executor.windowClosed(control.windowId);
      releaseActive();

      await expect(active).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      await expect(queued).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      expect(first.debugger.attach).not.toHaveBeenCalled();
      expect(first.debugger.detach).not.toHaveBeenCalled();
      await executor.cleanup();
      expect(first.debugger.detach).not.toHaveBeenCalled();
    },
  );

  it("keeps navigation-changed targets inside the debugger LRU capacity", async () => {
    const contents = new Map<string, FakeWebContents & { debugger: any }>();
    for (const tabId of ["tab-one", "tab-two", "tab-three"]) {
      const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
      let attached = false;
      webContents.debugger = {
        attach: vi.fn(() => { attached = true; }),
        detach: vi.fn(() => { attached = false; }),
        isAttached: vi.fn(() => attached),
        sendCommand: vi.fn(async (method: string) => {
          if (method === "Page.getFrameTree") return { frameTree: { frame: { id: tabId } } };
          if (method === "Page.createIsolatedWorld") return { executionContextId: 41 };
          if (method === "Runtime.callFunctionOn") return { result: { value: { found: false } } };
          return {};
        }),
      };
      contents.set(tabId, webContents);
    }
    const executor = createBrowserPageExecutor({
      getWebContents: ({ tabId }: { tabId: string }) => contents.get(tabId),
      maxActiveTargets: 1,
    });
    cleanup.push(async () => executor.cleanup());
    for (const tabId of contents.keys()) {
      await executor.execute({
        actionTimeoutMs: 1_000,
        control: { ...control, tabId },
        request: { action: "query", target: { kind: "selector", selector: "main" } },
        signal: new AbortController().signal,
        tab: { navigationGeneration: 7, tabId },
      });
      executor.navigationChanged(control.windowId, tabId);
    }
    await vi.waitFor(() => {
      expect(contents.get("tab-one")?.debugger.detach).toHaveBeenCalledOnce();
      expect(contents.get("tab-two")?.debugger.detach).toHaveBeenCalledOnce();
    });
    expect(contents.get("tab-three")?.debugger.detach).not.toHaveBeenCalled();
    await executor.cleanup();
    expect(contents.get("tab-three")?.debugger.detach).toHaveBeenCalledOnce();
  });

  it("keeps a terminal target identity retired when a replacement uses the same key", async () => {
    const retired = new FakeWebContents();
    const replacement = new FakeWebContents();
    let current = retired;
    const executor = createBrowserPageExecutor({
      getWebContents: () => current,
      isolatedRunner: vi.fn(async () => ({ found: false })),
    });
    cleanup.push(async () => executor.cleanup());
    const input = {
      actionTimeoutMs: 1_000,
      control,
      request: { action: "query", target: { kind: "selector", selector: "main" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    };
    await executor.execute(input);
    await executor.tabClosed(control.windowId, control.tabId);
    await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });

    current = replacement;
    await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });
  });

  it.each(["tab", "window"])(
    "rejects stale contents when idle LRU cleanup settles before %s close",
    async (terminalKind) => {
      const first = new FakeWebContents() as FakeWebContents & { debugger: any };
      const second = new FakeWebContents();
      let attached = false;
      first.debugger = {
        attach: vi.fn(() => { attached = true; }),
        detach: vi.fn(() => { attached = false; }),
        isAttached: vi.fn(() => attached),
        sendCommand: vi.fn(async (method: string) => {
          if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "idle" } } };
          if (method === "Page.createIsolatedWorld") return { executionContextId: 51 };
          if (method === "Runtime.callFunctionOn") return { result: { value: { found: false } } };
          return {};
        }),
      };
      const executor = createBrowserPageExecutor({
        getWebContents: ({ tabId }: { tabId: string }) => tabId === "tab-one" ? first : second,
        maxActiveTargets: 1,
      });
      cleanup.push(async () => executor.cleanup());
      const input = {
        actionTimeoutMs: 1_000,
        control,
        request: { action: "query", target: { kind: "selector", selector: "main" } },
        signal: new AbortController().signal,
        tab: { navigationGeneration: 7, tabId: control.tabId },
      };
      await executor.execute(input);
      executor.registerTarget({
        control: { ...control, tabId: "tab-two" },
        tab: { navigationGeneration: 7, tabId: "tab-two" },
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(first.debugger.detach).toHaveBeenCalledOnce();

      if (terminalKind === "tab") await executor.tabClosed(control.windowId, control.tabId);
      else await executor.windowClosed(control.windowId);
      await expect(executor.execute(input)).rejects.toMatchObject({ code: "PAGE_CRASHED" });
      expect(first.debugger.attach).toHaveBeenCalledOnce();
      expect(first.debugger.detach).toHaveBeenCalledOnce();
    },
  );

  it("bounds terminal key tombstones with deterministic FIFO eviction", async () => {
    const contents = new Map<string, FakeWebContents>();
    for (const tabId of ["tab-one", "tab-two", "tab-three"]) {
      contents.set(tabId, new FakeWebContents());
    }
    const executor = createBrowserPageExecutor({
      getWebContents: ({ tabId }: { tabId: string }) => contents.get(tabId),
      isolatedRunner: vi.fn(async () => ({ found: false })),
      maxLifecycleTombstones: 2,
    });
    cleanup.push(async () => executor.cleanup());
    const input = (tabId: string) => ({
      actionTimeoutMs: 1_000,
      control: { ...control, tabId },
      request: { action: "query", target: { kind: "selector", selector: "main" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId },
    });
    for (const tabId of contents.keys()) {
      await executor.execute(input(tabId));
      await executor.tabClosed(control.windowId, tabId);
      contents.set(tabId, new FakeWebContents());
    }

    await expect(executor.execute(input("tab-one"))).resolves.toMatchObject({ found: false });
    await expect(executor.execute(input("tab-two"))).rejects.toMatchObject({ code: "PAGE_CRASHED" });
    await expect(executor.execute(input("tab-three"))).rejects.toMatchObject({ code: "PAGE_CRASHED" });
  });

  it("counts CDP queue time against the action deadline and never runs an expired queued command", async () => {
    const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
    let releaseFirst!: () => void;
    let markStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    const firstResult = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    webContents.debugger = {
      attach: vi.fn(),
      detach: vi.fn(),
      isAttached: vi.fn(() => true),
      sendCommand: vi.fn(async (method: string) => {
        if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } };
        if (method === "Page.createIsolatedWorld") return { executionContextId: 9 };
        if (method === "Runtime.callFunctionOn") {
          calls += 1;
          markStarted();
          await firstResult;
          return { result: { value: { found: false } } };
        }
        return {};
      }),
    };
    const executor = createBrowserPageExecutor({ getWebContents: () => webContents });
    cleanup.push(async () => executor.cleanup());
    const base = {
      control,
      request: { action: "query", target: { kind: "selector", selector: "main" } },
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    };
    const first = executor.execute({ ...base, actionTimeoutMs: 1_000 });
    await firstStarted;
    const second = executor.execute({ ...base, actionTimeoutMs: 5 });
    await expect(second).rejects.toMatchObject({ code: "TIMEOUT" });
    releaseFirst();
    await first;
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("terminates CDP caller code and releases an executor-owned debugger before timeout settles", async () => {
    const webContents = new FakeWebContents() as FakeWebContents & { debugger: any };
    let attached = false;
    let terminated = false;
    const debuggerApi = {
      attach: vi.fn(() => { attached = true; }),
      detach: vi.fn(() => { attached = false; }),
      isAttached: vi.fn(() => attached),
      sendCommand: vi.fn(async (method: string) => {
        if (method === "Runtime.evaluate") return new Promise(() => undefined);
        if (method === "Runtime.terminateExecution") {
          terminated = true;
          return {};
        }
        return {};
      }),
    };
    webContents.debugger = debuggerApi;
    const executor = createBrowserPageExecutor({ getWebContents: () => webContents });
    const request = { action: "execute_js", source: "while (true) {}" };
    await expect(executor.execute({
      actionTimeoutMs: 5,
      approvedPayloadHash: hashBrowserExecutorPayload(request),
      control,
      request,
      signal: new AbortController().signal,
      tab: { navigationGeneration: 7, tabId: control.tabId },
    })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(terminated).toBe(true);
    expect(debuggerApi.detach).toHaveBeenCalledOnce();
    expect(attached).toBe(false);
  });
});
