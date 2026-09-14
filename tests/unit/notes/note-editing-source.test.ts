import { describe, expect, it } from "vitest";
import {
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";

describe("note editing source", () => {
  it("splits a leading h1 into a separate title and body editor source", () => {
    const rawSource = "# Daily Review\n\nShadow the line\n- Keep breathing steady\n";

    const editable = parseEditableNoteSource(rawSource, "notes/daily-review.md");

    expect(editable.title).toBe("Daily Review");
    expect(editable.titleStorage).toBe("heading");
    expect(editable.bodyLineStart).toBe(2);
    expect(editable.bodySource).toBe("Shadow the line\n- Keep breathing steady\n");
    expect(
      composeEditableNoteSource(editable, {
        bodySource: editable.bodySource,
        title: editable.title,
      }),
    ).toBe(rawSource);
  });

  it("keeps basename-backed notes body-only until the title is explicitly changed", () => {
    const rawSource = "Shadow the line\n";
    const editable = parseEditableNoteSource(rawSource, "notes/daily-review.md");

    expect(editable.title).toBe("daily-review");
    expect(editable.titleStorage).toBe("virtual");
    expect(
      composeEditableNoteSource(editable, {
        bodySource: editable.bodySource,
        title: editable.title,
      }),
    ).toBe(rawSource);
    expect(
      composeEditableNoteSource(editable, {
        bodySource: editable.bodySource,
        title: "Daily Review",
      }),
    ).toBe("# Daily Review\n\nShadow the line\n");
  });

  it("treats a duplicate leading h1 as title-only when frontmatter already defines the title", () => {
    const editable = parseEditableNoteSource(
      ["---", "title: Daily Review", "---", "# Daily Review", "", "Shadow the line"].join("\n"),
      "notes/daily-review.md",
    );

    expect(editable.titleStorage).toBe("frontmatter");
    expect(editable.bodyLineStart).toBe(2);
    expect(editable.bodySource).toBe("Shadow the line");
  });
});
