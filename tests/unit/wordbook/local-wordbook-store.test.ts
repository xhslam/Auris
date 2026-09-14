import {
  createLocalWordbookStorage,
  type SavedWordRecord,
} from "@/features/wordbook/local-wordbook-store";

describe("local wordbook storage", () => {
  it("saves a word once and keeps the latest snapshot", async () => {
    const storage = createLocalWordbookStorage(window.localStorage);

    const first: SavedWordRecord = {
      createdAt: "2026-03-18T00:00:00.000Z",
      definitions: ["first definition"],
      lexicalCategory: "noun",
      sourceLabel: "WordNet Offline",
      synonyms: ["speech"],
      word: "language",
    };
    const second: SavedWordRecord = {
      createdAt: "2026-03-18T01:00:00.000Z",
      definitions: ["updated definition"],
      lexicalCategory: "noun",
      sourceLabel: "WordNet Offline",
      synonyms: ["tongue"],
      word: "language",
    };

    await storage.saveWord(first);
    await storage.saveWord(second);

    expect(storage.readWordsSnapshot()).toEqual([second]);
    await expect(storage.listWords()).resolves.toEqual([second]);
  });

  it("deletes a saved word by its lowercase key", async () => {
    const storage = createLocalWordbookStorage(window.localStorage);

    await storage.saveWord({
      createdAt: "2026-03-18T00:00:00.000Z",
      definitions: ["first definition"],
      lexicalCategory: "noun",
      sourceLabel: "WordNet Offline",
      synonyms: ["speech"],
      word: "language",
    });

    await storage.deleteWord("LANGUAGE");

    await expect(storage.listWords()).resolves.toEqual([]);
  });
});
