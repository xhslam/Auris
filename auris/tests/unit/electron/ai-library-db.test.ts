import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createAiLibraryRepository } = require("../../../electron/ai-library-db.cjs");

describe("ai-library-db", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) {
      await fs.rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  async function createRepository() {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-ai-library-"));
    const databasePath = path.join(tempDirectory, "ai-library.db");
    return createAiLibraryRepository(databasePath);
  }

  it("supports prompt CRUD, search, export, and default-library import", async () => {
    const repository = await createRepository();

    const prompt = repository.savePrompt({
      category: "Writing",
      content: "Rewrite this paragraph in concise English.",
      isFavorite: true,
      tags: ["rewrite", "concise"],
      title: "Rewrite Paragraph",
      variables: ["tone"],
    });

    expect(prompt.id).toBeGreaterThan(0);
    expect(repository.listPrompts()).toHaveLength(1);
    expect(repository.searchPrompts("rewrite")).toHaveLength(1);

    const updated = repository.updatePrompt(prompt.id, {
      isFavorite: false,
      title: "Rewrite Paragraph v2",
    });

    expect(updated?.title).toBe("Rewrite Paragraph v2");
    expect(updated?.isFavorite).toBe(false);

    const exported = repository.exportPrompts();
    expect(exported.prompts).toHaveLength(1);
    expect(exported.version).toBe("1.0");

    const importedDefaults = repository.importDefaultPromptLibrary();
    expect(importedDefaults.imported).toBeGreaterThan(0);

    const afterDelete = repository.deletePrompt(prompt.id);
    expect(afterDelete.some((record: { id: number }) => record.id === prompt.id)).toBe(false);

    repository.close();
  });

  it("supports history save, search, favorite toggles, export, and import", async () => {
    const repository = await createRepository();

    const record = repository.saveHistory({
      content: "# Summary\n\nSaved conversation.",
      conversationId: "conversation-1",
      notes: "Captured from ChatGPT",
      provider: "chatgpt",
      tags: ["summary"],
      title: "Captured chat",
      url: "https://chatgpt.com/c/conversation-1",
    });

    expect(record?.id).toBeGreaterThan(0);
    expect(repository.listHistory()).toHaveLength(1);
    expect(repository.searchHistory("captured")).toHaveLength(1);

    const toggled = repository.toggleHistoryFavorite(record.id);
    expect(toggled?.isFavorite).toBe(true);

    const exported = repository.exportHistory();
    expect(exported.conversations).toHaveLength(1);

    const importResult = repository.importHistory(
      {
        conversations: [
          {
            content: "Imported conversation",
            conversationId: "conversation-2",
            notes: "",
            provider: "gemini",
            tags: ["imported"],
            timestamp: 1_710_000_000_100,
            title: "Imported chat",
            url: "https://gemini.google.com/app/conversation-2",
          },
        ],
      },
      "skip",
    );

    expect(importResult.imported).toBe(1);
    expect(repository.listHistory()).toHaveLength(2);

    const afterDelete = repository.deleteHistory(record.id);
    expect(afterDelete.some((item: { id: number }) => item.id === record.id)).toBe(false);

    repository.close();
  });
});
