import NotesPage from "@/app/notes/page";
import { NotesPageClient } from "@/components/notes-v2/notes-page-client";

describe("NotesPage", () => {
  it("renders the notes workbench directly without the legacy desktop loading shell", async () => {
    const result = await NotesPage({
      searchParams: Promise.resolve({ resumeNoteId: "notes/rhythm-drill.md" }),
    });

    expect(result.type).toBe(NotesPageClient);
    expect(result.props.resumeNoteId).toBe("notes/rhythm-drill.md");
  });
});
