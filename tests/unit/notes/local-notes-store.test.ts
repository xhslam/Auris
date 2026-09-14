import { describe, expect, it } from "vitest";
import {
  createMemoryNotesStorage,
  createNoteBlock,
  createNotePage,
} from "@/features/notes/local-notes-store";

describe("memory notes store", () => {
  it("creates a default welcome page when storage starts empty", async () => {
    const storage = createMemoryNotesStorage();

    const pages = await storage.listPages();

    expect(pages).toHaveLength(1);
    expect(pages[0]?.title).toBe("学习笔记");
  });

  it("creates and persists a new note page", async () => {
    const storage = createMemoryNotesStorage();

    const createdPage = await storage.createPage({
      title: "Shadow Review",
    });

    const pages = await storage.listPages();

    expect(createdPage.title).toBe("Shadow Review");
    expect(pages.some((page) => page.title === "Shadow Review")).toBe(true);
  });

  it("updates blocks for an existing page", async () => {
    const storage = createMemoryNotesStorage({
      pages: [
        createNotePage({
          blocks: [createNoteBlock("paragraph", "Review rhythm today")],
          fileName: "review-note.md",
          id: "note-1",
          title: "Review Page",
        }),
      ],
    });

    await storage.savePage({
      blocks: [
        createNoteBlock("paragraph", "Review rhythm today"),
        createNoteBlock("todo", "Add rhythm to tomorrow plan"),
      ],
      fileName: "review-note.md",
      icon: "N",
      id: "note-1",
      title: "Review Page",
      updatedAt: "2026-03-19T10:00:00.000Z",
    });

    const savedPage = await storage.getPage("note-1");

    expect(savedPage?.blocks).toHaveLength(2);
    expect(savedPage?.blocks[1]?.type).toBe("todo");
  });
});
