import { describe, expect, it } from "vitest";
import { getNoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";

describe("getNoteOpenStrategy", () => {
  it("keeps small notes in the full editor", () => {
    expect(getNoteOpenStrategy(2000).mode).toBe("full-editor");
  });

  it("downgrades large notes before they become huge", () => {
    expect(getNoteOpenStrategy(2 * 1024 * 1024).mode).toBe("reduced-editor");
  });

  it("uses plain-text strategy for huge notes", () => {
    expect(getNoteOpenStrategy(6 * 1024 * 1024).mode).toBe("plain-text");
  });
});
