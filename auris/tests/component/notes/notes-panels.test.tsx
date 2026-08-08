import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesBacklinksPanel } from "@/components/notes-v2/notes-backlinks-panel";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NotesLearningPanel } from "@/components/notes-v2/notes-learning-panel";
import { NotesOutlinePanel } from "@/components/notes-v2/notes-outline-panel";
import { NotesPropertiesPanel } from "@/components/notes-v2/notes-properties-panel";
import { NotesReadingPane } from "@/components/notes-v2/notes-reading-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";

function createDocument(): NoteDocument {
  return {
    basename: "daily",
    fileName: "daily.md",
    frontmatter: {
      aliases: ["Daily Review"],
      topic: "shadowing",
    },
    mtime: "2026-04-04T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: ["shadowing"],
      tasks: [],
      title: "Daily Review",
      wordCount: 12,
    },
    path: "notes/daily.md",
    rawSource: "# Daily Review",
  };
}

const SNIPPETS: LearningSnippet[] = [
  {
    id: "word:shadow",
    kind: "word",
    label: "shadow",
    markdown: "## Word · shadow",
    searchText: "shadow practice",
  },
];

describe("NotesPropertiesPanel", () => {
  it("renders compact document metadata and frontmatter fields", () => {
    render(<NotesPropertiesPanel document={createDocument()} />);

    expect(
      screen.queryByRole("heading", {
        name: NOTES_UI_COPY.panels.properties.title,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("notes/daily.md")).toBeInTheDocument();
    expect(screen.getAllByText("shadowing")).toHaveLength(2);
    expect(screen.getByText("Daily Review")).toBeInTheDocument();
  });
});

describe("NotesOutlinePanel", () => {
  it("highlights the current heading and jumps when a heading is clicked", async () => {
    const user = userEvent.setup();
    const onJumpToHeading = vi.fn();

    render(
      <NotesOutlinePanel
        activeLine={4}
        document={{
          ...createDocument(),
          parsed: {
            ...createDocument().parsed,
            headings: [
              {
                depth: 1,
                line: 0,
                slug: "daily-review",
                text: "Daily Review",
              },
              {
                depth: 2,
                line: 3,
                slug: "shadowing-plan",
                text: "Shadowing Plan",
              },
            ],
          },
        }}
        onJumpToHeading={onJumpToHeading}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Shadowing Plan" }),
    ).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "Daily Review" }));

    expect(onJumpToHeading).toHaveBeenCalledWith(0);
  });
});

describe("NotesBacklinksPanel", () => {
  it("renders backlinks in a compact list without extra heading chrome", () => {
    render(
      <NotesBacklinksPanel
        backlinks={[createDocument()]}
        onOpenPath={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("heading", {
        name: NOTES_UI_COPY.panels.backlinks.title,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Daily Review/i }),
    ).toBeInTheDocument();
  });

  it("renders linked excerpts and unlinked Obsidian-style mentions", () => {
    const target = {
      ...createDocument(),
      basename: "grammar",
      fileName: "grammar.md",
      parsed: {
        ...createDocument().parsed,
        title: "Grammar",
      },
      path: "notes/grammar.md",
      rawSource: "# Grammar",
    };
    const linked = {
      ...createDocument(),
      parsed: {
        ...createDocument().parsed,
        links: [{ alias: null, heading: null, target: "Grammar" }],
        title: "Daily",
      },
      path: "notes/daily.md",
      rawSource: "Review [[Grammar]] before the drill.",
    };
    const unlinked = {
      ...createDocument(),
      parsed: {
        ...createDocument().parsed,
        title: "Loose thought",
      },
      path: "notes/loose.md",
      rawSource: "Grammar appears here without a link.",
    };

    render(
      <NotesBacklinksPanel
        activeDocument={target}
        backlinks={[linked]}
        documents={[target, linked, unlinked]}
        onOpenPath={vi.fn()}
      />,
    );

    expect(screen.getByText("Linked mentions")).toBeInTheDocument();
    expect(screen.getByText("Unlinked mentions")).toBeInTheDocument();
    expect(screen.getByText("Review [[Grammar]] before the drill.")).toBeInTheDocument();
    expect(screen.getByText("Grammar appears here without a link.")).toBeInTheDocument();
  });
});

describe("NotesReadingPane", () => {
  it("renders ordered lists and Obsidian callouts in reading mode", () => {
    render(
      <NotesReadingPane
        document={{
          ...createDocument(),
          rawSource:
            "# Daily Review\n\n> [!note] Pronunciation cue\n> Keep the airflow steady.\n\n1. Warm up\n2. Shadow aloud",
        }}
      />,
    );

    expect(screen.getByText("Pronunciation cue")).toBeInTheDocument();
    expect(screen.getByText("Keep the airflow steady.")).toBeInTheDocument();
    expect(screen.getByText("Warm up")).toBeInTheDocument();
    expect(screen.getByText("Shadow aloud")).toBeInTheDocument();
  });
});

describe("NotesLearningPanel", () => {
  it("inserts a selected snippet with compact learning chrome", async () => {
    const user = userEvent.setup();
    const onInsertSnippet = vi.fn();

    render(
      <NotesLearningPanel
        onInsertSnippet={onInsertSnippet}
        onQueryChange={vi.fn()}
        query=""
        snippets={SNIPPETS}
      />,
    );

    expect(
      screen.queryByRole("heading", {
        name: NOTES_UI_COPY.panels.learning.title,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        NOTES_UI_COPY.panels.learning.searchPlaceholder,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /shadow/i }));

    expect(onInsertSnippet).toHaveBeenCalledWith("## Word · shadow");
  });
});
