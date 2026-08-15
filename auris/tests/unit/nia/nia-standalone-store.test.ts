import { afterEach, describe, expect, it } from "vitest";
import { createBrowserReferenceContext, createReadingReferenceContext } from "@/features/nia/nia-context";
import { __resetNiaStandaloneStoreForTests, useNiaStandaloneStore } from "@/features/nia/nia-standalone-store";

afterEach(() => __resetNiaStandaloneStoreForTests());

describe("Nia standalone context store", () => {
  it("keeps independently attached contexts in a bounded drawer and makes the newest one active", () => {
    const browser = createBrowserReferenceContext({ title: "Page", url: "https://example.com" });
    const reading = createReadingReferenceContext({ sourceId: "book", title: "Book", text: "Excerpt" });
    useNiaStandaloneStore.getState().open({ browserTarget: { windowId: "window", tabId: "tab" }, context: browser, origin: "browser" });
    useNiaStandaloneStore.getState().open({ context: reading, origin: "reading" });
    const state = useNiaStandaloneStore.getState();
    expect(state.contextCards).toHaveLength(2);
    expect(state.context?.kind).toBe("reading_reference");
    expect(state.activeContextCardId).toBe(state.contextCards[1].id);
  });

  it("selects and removes one card without deleting unrelated explicit context", () => {
    const browser = createBrowserReferenceContext({ url: "https://example.com" });
    const reading = createReadingReferenceContext({ sourceId: "book", title: "Book" });
    const store = useNiaStandaloneStore.getState();
    store.open({ context: browser, origin: "browser" });
    store.open({ context: reading, origin: "reading" });
    const browserId = useNiaStandaloneStore.getState().contextCards[0].id;
    useNiaStandaloneStore.getState().selectContextCard(browserId);
    expect(useNiaStandaloneStore.getState().context?.kind).toBe("browser_reference");
    useNiaStandaloneStore.getState().removeContextCard(browserId);
    expect(useNiaStandaloneStore.getState().contextCards).toHaveLength(1);
    expect(useNiaStandaloneStore.getState().context?.kind).toBe("reading_reference");
  });
});
