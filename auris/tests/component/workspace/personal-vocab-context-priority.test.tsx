import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedWordCard } from "@/components/workspace/segmented-word-card";
import { WordDefinitionPopover } from "@/components/workspace/word-definition-popover";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import wordIndex from "@/features/dictionary/personal-vocab/word-index.json";
import type { WordCardEntry } from "@/features/dictionary/word-card-entry";

const awarenessEntry = wordIndex.entries.find(
  (entry) => entry.lookupKey === "awareness",
)!;
const SAVED_CONTEXT_LINES = awarenessEntry.sections.find(
  (section: { title: string }) => section.title === "当前语境",
)!.lines;
const SAVED_CONTEXT_SUMMARY = SAVED_CONTEXT_LINES[0].replace(/^折叠摘要：/, "");
const SAVED_CONTEXT_DETAIL = SAVED_CONTEXT_LINES[1].replace(/^展开解析：/, "");
const LIVE_READING_CONTEXT =
  "The entire imported dragon boat essay should not replace the saved vocabulary context.";

const wordCardEntry: WordCardEntry = {
  definition: awarenessEntry.definition,
  examples: [],
  partOfSpeech: awarenessEntry.partOfSpeech,
  phonetic: awarenessEntry.pronunciations[0],
  relatedWords: [],
  sections: awarenessEntry.sections,
  word: awarenessEntry.word,
};

const dictionaryEntry: DictionaryEntry = {
  meanings: [
    {
      definitions: [awarenessEntry.definition],
      lexicalCategory: awarenessEntry.partOfSpeech,
    },
  ],
  personal: {
    definition: awarenessEntry.definition,
    fileName: awarenessEntry.fileName,
    sections: awarenessEntry.sections,
    source: {},
  },
  pronunciations: awarenessEntry.pronunciations,
  sourceLabel: "个人词库",
  synonyms: [],
  word: awarenessEntry.word,
};

describe("personal vocabulary context roles", () => {
  it("uses the live sentence above saved analysis in segmented cards", async () => {
    const user = userEvent.setup();
    render(
      <SegmentedWordCard
        closeIcon={<span />}
        contextText={LIVE_READING_CONTEXT}
        entry={wordCardEntry}
        error={null}
        isLoading={false}
        isSaved={false}
        onClose={vi.fn()}
        onSaveToggle={vi.fn()}
        onSpeak={vi.fn()}
        saveIcon={<span />}
        speakIcon={<span />}
        term="awareness"
      />,
    );

    expect(screen.getByRole("region", { name: "在这句话里" })).toHaveTextContent(
      LIVE_READING_CONTEXT,
    );
    const contextRegion = screen.getByRole("region", { name: "当前语境" });
    expect(contextRegion).toHaveTextContent(SAVED_CONTEXT_DETAIL);
    expect(contextRegion).not.toHaveTextContent(SAVED_CONTEXT_SUMMARY);

    await user.click(screen.getByRole("button", { name: "词源构词" }));
    expect(screen.getByRole("button", { name: "当前语境" })).toHaveTextContent(
      SAVED_CONTEXT_SUMMARY,
    );
  });

  it("uses the saved vocabulary context in definition popovers", async () => {
    const user = userEvent.setup();
    render(
      <WordDefinitionPopover
        contextText={LIVE_READING_CONTEXT}
        entry={dictionaryEntry}
        error={null}
        isLoading={false}
        isSaved={false}
        popoverRef={createRef<HTMLDivElement>()}
        position={{ left: 12, top: 20 }}
        word="awareness"
      />,
    );

    await user.click(screen.getByRole("button", { name: "当前语境" }));

    expect(screen.getByText(SAVED_CONTEXT_LINES[0])).toBeInTheDocument();
    expect(screen.queryByText(LIVE_READING_CONTEXT)).not.toBeInTheDocument();
  });
});
