import {
  createLocalSentencebookStorage,
  type SavedSentenceRecord,
} from "@/features/sentencebook/local-sentencebook-store";

describe("local sentencebook storage", () => {
  it("saves a sentence once and keeps the latest snapshot", async () => {
    const storage = createLocalSentencebookStorage(window.localStorage);

    const first: SavedSentenceRecord = {
      createdAt: "2026-03-19T00:00:00.000Z",
      id: "sentence-1",
      sourceLabel: "Quick Shadowing Session",
      text: "Learning a language builds speaking confidence.",
      translation: "语言练习会建立开口自信。",
    };
    const second: SavedSentenceRecord = {
      createdAt: "2026-03-19T01:00:00.000Z",
      id: "sentence-1",
      sourceLabel: "Quick Shadowing Session",
      text: "Learning a language builds speaking confidence.",
      translation: "语言练习会帮助你建立表达自信。",
    };

    await storage.saveSentence(first);
    await storage.saveSentence(second);

    await expect(storage.listSentences()).resolves.toEqual([second]);
  });

  it("deletes a saved sentence by id", async () => {
    const storage = createLocalSentencebookStorage(window.localStorage);

    await storage.saveSentence({
      createdAt: "2026-03-19T00:00:00.000Z",
      id: "sentence-1",
      sourceLabel: "Quick Shadowing Session",
      text: "Learning a language builds speaking confidence.",
      translation: "语言练习会建立开口自信。",
    });

    await storage.deleteSentence("sentence-1");

    await expect(storage.listSentences()).resolves.toEqual([]);
  });
});
