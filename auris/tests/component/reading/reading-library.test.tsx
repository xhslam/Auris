import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ReadingLibrary } from "@/components/reading/reading-library";
import { createMemoryNotesStorage } from "@/features/notes/local-notes-store";
import type { ReadingSource } from "@/features/reading/reading-fixtures";
import { buildReadingSourceNotePage } from "@/features/reading/reading-source-note";

const replaceMock = vi.fn();
const searchParamsGetMock = vi.fn((_key: string) => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}));

function createPersistedReadingSource(): ReadingSource {
  return {
    category: "article",
    estimatedMinutes: 3,
    id: "delete-me-reading",
    kicker: "Local import",
    paragraphs: [
      {
        analysis: "placeholder",
        english: "This imported reading can be deleted from the library.",
        id: "delete-me-reading-1",
        order: 1,
        translation: "placeholder",
        wordKeys: [],
      },
    ],
    progress: 0,
    title: "Delete Me Reading",
  };
}

describe("ReadingLibrary", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not render topbar filters on the library list", () => {
    render(<ReadingLibrary notesStorage={null} onOpen={vi.fn()} />);

    expect(screen.queryByRole("navigation", { name: "筛选" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "导入阅读材料" })).not.toBeInTheDocument();
  });

  it("opens the import page with article selected by default", async () => {
    const user = userEvent.setup();
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "import" ? "1" : null,
    );

    render(<ReadingLibrary notesStorage={null} onOpen={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "导入阅读材料" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放入文章" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "放入书籍" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "放入题目" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "放入书籍" }));
    expect(screen.getByRole("button", { name: "放入书籍" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /选择文件并导入到「书籍」/ }),
    ).toBeInTheDocument();
  });

  it("imports a markdown file into the selected category", async () => {
    const user = userEvent.setup();
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "import" ? "1" : null,
    );
    const storage = createMemoryNotesStorage({ pages: [] });
    const savePageSpy = vi.spyOn(storage, "savePage");
    const onImported = vi.fn();
    const onOpen = vi.fn();

    render(
      <ReadingLibrary
        notesStorage={storage}
        onImported={onImported}
        onOpen={onOpen}
      />,
    );

    await user.click(screen.getByRole("button", { name: "放入题目" }));

    const file = new File(
      ["Local reading starts with a small paragraph.\n\nSecond notes keep context close."],
      "Exam Notes.md",
      { type: "text/markdown" },
    );
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(savePageSpy).toHaveBeenCalledTimes(1);
    });

    expect(onImported.mock.calls[0]![0].category).toBe("exam");
    expect(onImported.mock.calls[0]![0].title).toBe("Exam Notes");
    expect(replaceMock).toHaveBeenCalledWith("/reading?filter=exam", {
      scroll: false,
    });
  });

  it("groups visible sources under date labels", async () => {
    render(<ReadingLibrary notesStorage={null} onOpen={vi.fn()} />);

    expect(await screen.findByText("Quiet Momentum")).toBeInTheDocument();
    expect(screen.getByText("2026.06.21")).toBeInTheDocument();
    expect(screen.getByText("2026.06.14")).toBeInTheDocument();
  });

  it("deletes a persisted reading from the library page without opening it", async () => {
    const user = userEvent.setup();
    const source = createPersistedReadingSource();
    const storage = createMemoryNotesStorage({
      pages: [buildReadingSourceNotePage(source)],
    });
    const deletePageSpy = vi.spyOn(storage, "deletePage");
    const onOpen = vi.fn();

    render(<ReadingLibrary notesStorage={storage} onOpen={onOpen} />);

    expect(await screen.findByText("Delete Me Reading")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 Delete Me Reading" }));

    await waitFor(() => {
      expect(screen.queryByText("Delete Me Reading")).not.toBeInTheDocument();
      expect(deletePageSpy).toHaveBeenCalledWith(source.id);
    });
    expect(onOpen).not.toHaveBeenCalled();
    await expect(storage.getPage(source.id)).resolves.toBeNull();
  });

  it("reloads the Reading folder when the vault reports an external change", async () => {
    let emitChange: () => void = () => undefined;
    const source = createPersistedReadingSource();
    const storage = Object.assign(
      createMemoryNotesStorage({ pages: [buildReadingSourceNotePage(source)] }),
      {
        subscribeToChanges(listener: () => void) {
          emitChange = listener;
          return () => {
            emitChange = () => undefined;
          };
        },
      },
    );

    render(<ReadingLibrary notesStorage={storage} onOpen={vi.fn()} />);
    expect(await screen.findByText("Delete Me Reading")).toBeInTheDocument();

    const originalPage = buildReadingSourceNotePage(source);
    const renamedPage = {
      ...originalPage,
      fileName: `Renamed Outside Auris--${source.id}.md`,
      relativePath: `Reading/Renamed Outside Auris--${source.id}.md`,
    };
    await storage.deletePage(source.id);
    await storage.savePage(renamedPage);
    emitChange();

    expect(await screen.findByText("Renamed Outside Auris")).toBeInTheDocument();
    expect(screen.queryByText("Delete Me Reading")).not.toBeInTheDocument();
  });

  it("filters the library from the reading URL query", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "filter" ? "article" : null,
    );

    const article = {
      ...createPersistedReadingSource(),
      category: "article" as const,
      id: "article-one",
      title: "Article One",
    };
    const book = {
      ...createPersistedReadingSource(),
      category: "book" as const,
      id: "book-one",
      title: "Book One",
    };
    const storage = createMemoryNotesStorage({
      pages: [buildReadingSourceNotePage(article), buildReadingSourceNotePage(book)],
    });

    render(<ReadingLibrary notesStorage={storage} onOpen={vi.fn()} />);

    expect(await screen.findByText("Article One")).toBeInTheDocument();
    expect(screen.queryByText("Book One")).not.toBeInTheDocument();
  });
});
