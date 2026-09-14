import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import {
  applyBacklinksToDocuments,
  buildLiveBacklinksIndex,
  createLiveNoteDocument,
  createLiveNoteDraft,
  mergeLiveNoteDocuments,
} from "@/features/notes/workspace/workbench-documents";

function createDocument(path: string, rawSource: string) {
  return createNoteDocument({
    mtime: "2026-04-04T00:00:00.000Z",
    path,
    rawSource,
  });
}

describe("workbench-documents", () => {
  it("creates lightweight live drafts without rebuilding parsed metadata on each keystroke", () => {
    const daily = createDocument("notes/daily.md", "# Daily\n\n[[Grammar]]");
    const liveDraft = createLiveNoteDraft(daily, "# Daily\n\n[[Pronunciation]]");

    expect(liveDraft.rawSource).toContain("[[Pronunciation]]");
    expect(liveDraft.parsed).toBe(daily.parsed);
    expect(liveDraft.frontmatter).toBe(daily.frontmatter);
  });

  it("replaces only the edited document when merging live drafts", () => {
    const daily = createDocument("notes/daily.md", "# Daily\n\n[[Grammar]]");
    const grammar = createDocument("notes/grammar.md", "# Grammar");
    const liveDaily = createLiveNoteDraft(daily, "# Daily\n\n[[Pronunciation]]");

    const merged = mergeLiveNoteDocuments([daily, grammar], {
      [daily.path]: liveDaily,
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]?.rawSource).toContain("[[Pronunciation]]");
    expect(merged[1]).toBe(grammar);
    expect(daily.rawSource).toContain("[[Grammar]]");
  });

  it("rebuilds backlinks from the live markdown source instead of the stale snapshot", () => {
    const daily = createDocument("notes/daily.md", "# Daily\n\n[[Grammar]]");
    const grammar = createDocument("notes/grammar.md", "# Grammar");
    const pronunciation = createDocument("notes/pronunciation.md", "# Pronunciation");
    const liveDaily = createLiveNoteDocument(daily, "# Daily\n\n[[Pronunciation]]");

    const backlinks = buildLiveBacklinksIndex([daily, grammar, pronunciation], {
      [daily.path]: liveDaily,
    });

    expect(backlinks["notes/grammar.md"]).toEqual([]);
    expect(backlinks["notes/pronunciation.md"]).toEqual(["notes/daily.md"]);
  });

  it("applies the latest backlinks without mutating the original parsed indexes", () => {
    const daily = createDocument("notes/daily.md", "# Daily");
    const grammar = createDocument("notes/grammar.md", "# Grammar");

    const nextDocuments = applyBacklinksToDocuments([daily, grammar], {
      "notes/daily.md": [],
      "notes/grammar.md": ["notes/daily.md"],
    });

    expect(nextDocuments[1]?.parsed.backlinks).toEqual(["notes/daily.md"]);
    expect(grammar.parsed.backlinks).toEqual([]);
  });
});
