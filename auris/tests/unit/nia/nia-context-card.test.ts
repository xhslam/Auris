import { describe, expect, it } from "vitest";
import {
  createBrowserReferenceContext,
  createReadingReferenceContext,
  createVideoReferenceContext,
  formatNiaContextForPrompt,
} from "@/features/nia/nia-context";
import { createNiaContextCard, upsertNiaContextCard } from "@/features/nia/nia-context-card";

describe("Nia context cards", () => {
  it("normalizes browser context into an explicit, human-readable card", () => {
    const context = createBrowserReferenceContext({ title: "Study page", url: "https://user:secret@example.com/guide" });
    const card = createNiaContextCard({ attachedAt: 100, context, origin: "browser" });
    expect(card.kind).toBe("browser");
    expect(card.title).toBe("Study page");
    expect(card.summary).toBe("https://example.com/guide");
    expect(card.id).not.toContain("secret");
  });

  it("supports reading and video references without pretending that they are notes", () => {
    const reading = createReadingReferenceContext({ sourceId: "book-1", title: "Deep Work", location: "Chapter 2", text: "Focus is valuable." });
    const video = createVideoReferenceContext({ videoId: "video-1", title: "Lecture", positionMs: 45_000, transcript: "Important idea." });
    expect(createNiaContextCard({ context: reading, origin: "reading" }).kind).toBe("reading");
    expect(createNiaContextCard({ context: video, origin: "video" }).summary).toBe("Video · 45s");
    expect(formatNiaContextForPrompt(reading)).toContain("Location: Chapter 2");
    expect(formatNiaContextForPrompt(video)).toContain("Position: 45000ms");
  });

  it("deduplicates the same explicit source while preserving the most recent card", () => {
    const context = createBrowserReferenceContext({ title: "A", url: "https://example.com" });
    const first = createNiaContextCard({ attachedAt: 1, context, origin: "browser" });
    const latest = createNiaContextCard({ attachedAt: 2, context, origin: "browser" });
    const cards = upsertNiaContextCard([first], latest);
    expect(cards).toHaveLength(1);
    expect(cards[0].attachedAt).toBe(2);
  });
});
