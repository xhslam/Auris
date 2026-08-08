import { createMobileNotesStorage } from "@/platform/notes/mobile-notes-storage";

function createMemoryBackend() {
  const store = new Map<string, string>();

  return {
    async getItem(key: string) {
      return store.get(key) ?? null;
    },
    async removeItem(key: string) {
      store.delete(key);
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("mobile notes storage", () => {
  it("lists, creates, saves, and deletes note pages through the mobile storage contract", async () => {
    const storage = createMobileNotesStorage({
      backend: createMemoryBackend(),
    });

    const page = await storage.createPage({
      icon: "A",
      title: "App Note",
    });

    await storage.savePage({
      ...page,
      markdownBody: "# hello",
      title: "Updated App Note",
    });

    const pages = await storage.listPages();
    const savedPage = await storage.getPage(page.id);

    expect(pages).toHaveLength(1);
    expect(savedPage?.markdownBody).toContain("hello");
    expect(savedPage?.title).toBe("Updated App Note");

    await storage.deletePage(page.id);

    expect(await storage.listPages()).toEqual([]);
  });
});
