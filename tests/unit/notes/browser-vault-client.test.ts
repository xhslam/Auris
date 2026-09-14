import { describe, expect, it } from "vitest";
import { createBrowserVaultClient } from "@/features/notes/vault/browser-vault-client";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("browser vault client", () => {
  it("keeps empty fallback directories visible after creation", async () => {
    const client = createBrowserVaultClient(new MemoryStorage());

    await client.createDirectory("Projects/Empty");

    const paths = (await client.listEntries()).map((entry) => entry.path);

    expect(paths).toContain("Projects");
    expect(paths).toContain("Projects/Empty");
  });

  it("renames and deletes fallback directory subtrees", async () => {
    const client = createBrowserVaultClient(new MemoryStorage());

    await client.createDirectory("Projects/Empty");
    await client.writeFile("Projects/Empty/note.md", "# Note");
    await client.renameEntry("Projects", "Archive");

    const renamedPaths = (await client.listEntries()).map((entry) => entry.path);

    expect(renamedPaths).toContain("Archive");
    expect(renamedPaths).toContain("Archive/Empty");
    expect(renamedPaths).toContain("Archive/Empty/note.md");
    expect(renamedPaths).not.toContain("Projects");

    await client.deleteEntry("Archive/Empty");

    const remainingPaths = (await client.listEntries()).map((entry) => entry.path);

    expect(remainingPaths).toContain("Archive");
    expect(remainingPaths).not.toContain("Archive/Empty");
    expect(remainingPaths).not.toContain("Archive/Empty/note.md");
  });
});
