import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesWelcomeScreen } from "@/components/notes-v2/notes-welcome-screen";
import type { NoteDocument } from "@/features/notes/documents/document-types";

const recentDocument = {
  basename: "daily.md",
  fileName: "daily.md",
  parsed: { headings: [], links: [], tags: [], title: "Daily review" },
  path: "daily.md",
  rawSource: "# Daily review",
} as unknown as NoteDocument;

describe("NotesWelcomeScreen", () => {
  it("renders the three desktop file actions and the selected reading theme", () => {
    render(
      <NotesWelcomeScreen
        documents={[]}
        recentFiles={[]}
        theme="night"
        onCreateFile={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenRecent={vi.fn()}
      />,
    );

    expect(screen.getByRole("main")).toHaveAttribute("data-notes-theme", "night");
    expect(screen.getByRole("button", { name: /新建文件/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^打开文件(?!夹)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /打开文件夹/ })).toBeInTheDocument();
  });

  it("shows recent documents and sends the relative path to the open handler", async () => {
    const onOpenRecent = vi.fn();
    render(
      <NotesWelcomeScreen
        documents={[recentDocument]}
        recentFiles={["daily.md"]}
        theme="mint"
        onCreateFile={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenRecent={onOpenRecent}
      />,
    );

    expect(screen.getByText("Daily review")).toBeInTheDocument();
    await screen.getByRole("button", { name: /Daily review/ }).click();
    expect(onOpenRecent).toHaveBeenCalledWith("daily.md");
  });
});
