import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ReadingWorkbench } from "@/components/reading/reading-workbench";
import { createMemoryNotesStorage } from "@/features/notes/local-notes-store";
import { buildReadingSourceNotePage } from "@/features/reading/reading-source-note";
import type { ReadingSource } from "@/features/reading/reading-fixtures";
import { createLocalWordbookStorage } from "@/features/wordbook/local-wordbook-store";
import { INFORM_PERSONAL_VOCAB_ENTRY } from "../../fixtures/dictionary/inform-personal-vocab";

function createPersistedReadingSource(
  overrides: Partial<ReadingSource> = {},
): ReadingSource {
  return {
    category: "article",
    estimatedMinutes: 4,
    id: "local-reading-persisted",
    kicker: "Local import",
    paragraphs: [
      {
        analysis: "placeholder",
        english: "Persisted readings survive a reload through the notes vault.",
        id: "local-reading-persisted-paragraph-1",
        order: 1,
        translation: "placeholder",
        wordKeys: ["momentum"],
      },
    ],
    progress: 0,
    title: "Persisted Reading",
    ...overrides,
  };
}

describe("ReadingWorkbench", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a minimal reader with the requested toolbar order", () => {
    render(<ReadingWorkbench notesStorage={null} />);

    expect(screen.queryByRole("heading", { name: "Reading" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reading library")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reading insight")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Quiet Momentum" })).toBeInTheDocument();
    expect(screen.getByText("晨间精读")).toBeInTheDocument();

    const toolbar = screen.getByLabelText("Reader actions");

    expect(
      within(toolbar).getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Reading progress 33%",
      "Toggle language view",
      "Text size",
      "调整正文行宽",
      "Toggle color mode",
    ]);

    expect(
      within(toolbar).queryByRole("button", { name: "Import reading material" }),
    ).not.toBeInTheDocument();
  });

  it("cycles language view across bilingual Chinese-only and English-only layouts", async () => {
    const user = userEvent.setup();

    render(<ReadingWorkbench notesStorage={null} />);

    const reader = screen.getByLabelText("Bilingual reader");
    const firstParagraph = within(reader)
      .getByText("安静的动能，来自学习者再次回到同一页时少了一点阻力。")
      .closest("article");

    expect(firstParagraph).toHaveAttribute("data-mode", "bilingual");

    await user.click(screen.getByRole("button", { name: "Toggle language view" }));

    expect(firstParagraph).toHaveAttribute("data-mode", "chinese");
    expect(reader).toHaveTextContent("安静的动能，来自学习者再次回到同一页时少了一点阻力。");
    expect(
      screen.queryByText("Quiet momentum begins when a learner returns to the same page"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle language view" }));

    expect(firstParagraph).toHaveAttribute("data-mode", "english");
    expect(reader).toHaveTextContent(
      "Quiet momentum begins when a learner returns to the same page",
    );
    expect(
      screen.queryByText("安静的动能，来自学习者再次回到同一页时少了一点阻力。"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle language view" }));

    expect(firstParagraph).toHaveAttribute("data-mode", "bilingual");
    expect(reader).toHaveTextContent(
      "Quiet momentum begins when a learner returns to the same page",
    );
    expect(reader).toHaveTextContent("安静的动能，来自学习者再次回到同一页时少了一点阻力。");
  });

  it("loads persisted reading sources from the vault on mount", async () => {
    const persistedPage = buildReadingSourceNotePage(createPersistedReadingSource());
    const storage = createMemoryNotesStorage({ pages: [persistedPage] });

    render(<ReadingWorkbench notesStorage={storage} />);

    expect(
      await screen.findByRole("heading", { name: "Persisted Reading" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Bilingual reader")).toHaveTextContent(
      "Persisted readings survive a reload through the notes vault.",
    );
  });

  it("reloads the open reading when its Markdown file changes externally", async () => {
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

    render(<ReadingWorkbench notesStorage={storage} />);
    expect(await screen.findByRole("heading", { name: "Persisted Reading" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bilingual reader")).toHaveTextContent(
      "Persisted readings survive",
    );

    await storage.savePage(
      buildReadingSourceNotePage({
        ...source,
        paragraphs: [
          {
            ...source.paragraphs[0]!,
            english: "This sentence was edited directly in the Reading folder.",
          },
        ],
      }),
    );
    emitChange();

    await vi.waitFor(() => {
      expect(screen.getByLabelText("Bilingual reader")).toHaveTextContent(
        "This sentence was edited directly",
      );
    });
    expect(screen.getByLabelText("Bilingual reader")).not.toHaveTextContent(
      "Persisted readings survive",
    );
  });

  it("adjusts reading content width from the top-right line-width control", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("auris.notes.typography");

    render(<ReadingWorkbench notesStorage={null} />);

    const page = document.querySelector(".reading-minimal__page");
    expect(page).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "调整正文行宽" }));

    const slider = screen.getByRole("slider", { name: "调整正文行宽" });
    fireEvent.change(slider, { target: { value: "0" } });

    const root = document.querySelector(".reading-minimal") as HTMLElement | null;
    expect(root?.style.getPropertyValue("--reading-content-width")).toBe("36em");

    fireEvent.change(slider, { target: { value: "100" } });
    expect(root?.style.getPropertyValue("--reading-content-width")).toBe(
      "min(1240px, 100%)",
    );
  });

  it("opens a right-click word card from the personal vocabulary API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          entry: INFORM_PERSONAL_VOCAB_ENTRY,
        }),
        ok: true,
      })),
    );
    const persistedPage = buildReadingSourceNotePage(
      createPersistedReadingSource({
        id: "inform-reading",
        paragraphs: [
          {
            analysis: "placeholder",
            english: "Inform the team before the meeting.",
            id: "inform-reading-paragraph-1",
            order: 1,
            translation: "placeholder",
            wordKeys: [],
          },
        ],
        title: "Inform Reading",
      }),
    );
    const storage = createMemoryNotesStorage({ pages: [persistedPage] });

    render(<ReadingWorkbench notesStorage={storage} />);

    expect(
      await screen.findByRole("heading", { name: "Inform Reading" }),
    ).toBeInTheDocument();

    const word = Array.from(document.querySelectorAll(".reading-minimal-word")).find(
      (element) => element.textContent?.trim() === "Inform",
    );
    expect(word).toBeDefined();

    fireEvent.contextMenu(word!);

    expect(await screen.findByText("在这句话里")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "当前语境" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.queryByText("核心意象: 底层支撑 + 决定上层 = 根本价值。"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "词源构词" }));

    expect(screen.getByRole("button", { name: "词源构词" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const etymologyPanel = screen.getByRole("region", { name: "词源构词" });
    const list = within(etymologyPanel).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("词源/构词").tagName).toBe("STRONG");
    expect(within(list).getByText("原始画面").tagName).toBe("STRONG");
    expect(within(list).getByText("核心意象").tagName).toBe("STRONG");
    expect(etymologyPanel).not.toHaveTextContent("**");
  });

  it("uses the canonical personal entry key for saved state and actions", async () => {
    const wordbook = createLocalWordbookStorage(window.localStorage);
    await wordbook.saveWord({
      createdAt: "2026-07-11T00:00:00.000Z",
      definitions: ["职责；义务"],
      lexicalCategory: "名词",
      sourceLabel: "Personal vocabulary",
      synonyms: [],
      word: "Duty",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          entry: {
            meanings: [
              {
                definitions: ["职责；义务"],
                lexicalCategory: "名词",
              },
            ],
            personal: {
              definition: "职责；义务",
              fileName: "duty.md",
              sections: [],
              source: {},
            },
            pronunciations: ["/ˈduːti/"],
            sourceLabel: "个人词库",
            synonyms: [],
            word: "Duty",
          },
        }),
        ok: true,
      })),
    );
    const persistedPage = buildReadingSourceNotePage(
      createPersistedReadingSource({
        id: "duties-reading",
        paragraphs: [
          {
            analysis: "placeholder",
            english: "Shared duties matter.",
            id: "duties-reading-paragraph-1",
            order: 1,
            translation: "placeholder",
            wordKeys: [],
          },
        ],
        title: "Duties Reading",
      }),
    );

    render(
      <ReadingWorkbench
        notesStorage={createMemoryNotesStorage({ pages: [persistedPage] })}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Duties Reading" })).toBeInTheDocument();
    const duties = Array.from(document.querySelectorAll(".reading-minimal-word")).find(
      (element) => element.textContent?.trim() === "duties",
    );
    expect(duties).toBeDefined();

    fireEvent.contextMenu(duties!);

    const removeButton = await screen.findByRole("button", { name: "取消收藏" });
    expect(screen.getByRole("heading", { name: "Duty" })).toBeInTheDocument();
    await userEvent.click(removeButton);

    expect(await screen.findByText("已从生词本移除：Duty")).toBeInTheDocument();
    expect(await wordbook.listWords()).toEqual([]);
    expect(window.localStorage.getItem("english-shadowing-wordbook")).not.toContain("duties");

    await userEvent.click(screen.getByRole("button", { name: "收藏到生词本" }));

    expect(await screen.findByText("已收藏到生词本：Duty")).toBeInTheDocument();
    expect((await wordbook.listWords()).map((item) => item.word)).toEqual(["Duty"]);
    expect(window.localStorage.getItem("english-shadowing-wordbook")).toContain('"word":"Duty"');
    expect(window.localStorage.getItem("english-shadowing-wordbook")).not.toContain(
      '"word":"duties"',
    );

    await userEvent.click(screen.getByRole("button", { name: "取消收藏" }));

    expect(await screen.findByText("已从生词本移除：Duty")).toBeInTheDocument();
    expect(await wordbook.listWords()).toEqual([]);
  });

  it("keeps a long word card inside the viewport with an internal scroller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          entry: {
            meanings: [
              {
                definitions: ["技术"],
                lexicalCategory: "名词",
              },
            ],
            personal: {
              definition: "技术",
              fileName: "technology.md",
              sections: [
                {
                  lines: Array.from({ length: 16 }, (_, index) => `长解析内容 ${index + 1}`),
                  title: "解释",
                },
              ],
              source: {},
            },
            pronunciations: ["/tekˈnɑːlədʒi/"],
            sourceLabel: "个人词库",
            synonyms: [],
            word: "Technology",
          },
        }),
        ok: true,
      })),
    );
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 600);
    const getSelection = vi.fn(() => ({ isCollapsed: true, toString: () => "" }));
    vi.stubGlobal("getSelection", getSelection);

    render(<ReadingWorkbench notesStorage={null} />);

    const word = Array.from(document.querySelectorAll(".reading-minimal-word")).find(
      (element) => element.textContent?.trim().startsWith("momentum"),
    ) as HTMLElement | undefined;
    expect(word).toBeDefined();

    fireEvent.contextMenu(word!, { clientX: 390, clientY: 398 });

    const popover = await screen.findByLabelText("Word definition");
    const top = Number.parseFloat(popover.style.top);
    const maxHeight = Number.parseFloat(popover.style.maxHeight);

    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + maxHeight).toBeLessThanOrEqual(600);
    expect(popover).toHaveAttribute("data-open", "true");
    expect(popover.querySelector("[data-word-card-drag-handle]")).not.toBeNull();
    expect(popover.querySelector(".word-segmented-card__body")).not.toBeNull();
  });
});
