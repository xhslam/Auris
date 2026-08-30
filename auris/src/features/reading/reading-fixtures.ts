export type ReadingSourceCategory =
  | "article"
  | "book"
  | "exam"
  | "episode"
  | "favorite";

/** How the reading workbench should present this source. */
export type ReadingSourceFormat = "text" | "pdf";

/** 考研英语一题型（MD `## 题型:` 标记）。 */
export type ReadingExamType =
  | "reading"
  | "new_order"
  | "new_seven_five"
  | "translation"
  | "writing_a"
  | "writing_b";

export type ReadingExamBlockKind =
  | "directions"
  | "overview"
  | "passage"
  | "logic_map"
  | "sentences"
  | "vocabulary"
  | "options"
  | "questions"
  | "synonyms"
  | "pitfalls"
  | "retelling"
  | "takeaways"
  | "summary"
  | "chain"
  | "paragraphs"
  | "underlined"
  | "answers"
  | "letter"
  | "chart"
  | "prompt"
  | "model"
  | "other";

export type ReadingExamBlock = {
  english: string;
  kind: ReadingExamBlockKind;
  /** Original Markdown heading, retained when the heading carries study meaning. */
  title?: string;
  translation?: string;
};

export type ReadingExamSection = {
  blocks: ReadingExamBlock[];
  label: string;
  type: ReadingExamType;
};

export type WordEntryStatus = "curated" | "draft";

export type WordChainEntry = {
  definition: string;
  examples: string[];
  /** 音标，如 /məˈmentəm/ */
  phonetic?: string;
  /** 词性，如 n. / v. */
  partOfSpeech?: string;
  /** 词缀拆分，如 ["mo", "ment", "um"] */
  morphemes?: string[];
  /** 巧记 / 带你背 */
  mnemonic?: string;
  /** curated 已人工校对 · draft AI 起草待审 */
  status?: WordEntryStatus;
  relatedWords: string[];
  root: string;
  word: string;
};

export type ReadingParagraph = {
  analysis: string;
  english: string;
  id: string;
  order: number;
  translation: string;
  wordKeys: string[];
};

export type ReadingSource = {
  category: ReadingSourceCategory;
  estimatedMinutes: number;
  id: string;
  /** ISO 时间：用户首次导入该文件的时间。 */
  importedAt?: string;
  kicker: string;
  /** 导入时的原始文件名，用于在 Vault 中生成人类可读的文件名。 */
  originalFileName?: string;
  paragraphs: ReadingParagraph[];
  progress: number;
  title: string;
  /**
   * `text` (default): bilingual paragraph reader.
   * `pdf`: original-layout PDF viewer with English lookup only (legacy).
   */
  format?: ReadingSourceFormat;
  /** PDF page count when format is pdf. */
  pageCount?: number;
  /**
   * In-memory PDF bytes for the current session (also hydrated from IndexedDB).
   * Not persisted inside the vault markdown note.
   */
  pdfBytes?: ArrayBuffer;
  /** 作者，列表卡片展示 */
  author?: string;
  /** 中文导读 / 摘要，列表卡片展示 */
  summary?: string;
  /** 发布日期 YYYY-MM-DD，内容库按此分组 */
  publishedAt?: string;
  /** MD 题型标记解析出的大题分区；有则精读页按题型版式渲染 */
  examSections?: ReadingExamSection[];
};

export const READING_CATEGORY_LABELS: Record<ReadingSourceCategory | "all", string> = {
  all: "All",
  article: "Articles",
  book: "Books",
  exam: "Exams",
  episode: "Episodes",
  favorite: "Favorites",
};

export const READING_WORD_CHAINS: Record<string, WordChainEntry> = {
  alignment: {
    definition: "a state where parts work together in a clear direction.",
    examples: ["The team found alignment after rewriting the goal."],
    mnemonic: "a-(朝) + line(线) + -ment(名词) → 排成一条线，即对齐、一致。",
    morphemes: ["a", "lign", "ment"],
    partOfSpeech: "n.",
    phonetic: "/əˈlaɪnmənt/",
    relatedWords: ["align", "line", "direction"],
    root: "line",
    status: "curated",
    word: "alignment",
  },
  cue: {
    definition: "a signal that helps someone know what to do next.",
    examples: ["Every pause becomes a cue for the learner."],
    mnemonic: "联想舞台提示：导演给演员的 cue，提示下一步该做什么。",
    morphemes: ["cue"],
    partOfSpeech: "n.",
    phonetic: "/kjuː/",
    relatedWords: ["signal", "hint", "prompt"],
    root: "signal",
    status: "curated",
    word: "cue",
  },
  momentum: {
    definition: "the force that keeps progress moving once it has started.",
    examples: ["Small wins create momentum for the next page."],
    mnemonic: "moment(瞬间) + -um → 一个个瞬间累积出来的'势'，即动能。",
    morphemes: ["mo", "ment", "um"],
    partOfSpeech: "n.",
    phonetic: "/məˈmentəm/",
    relatedWords: ["motion", "impulse", "progress"],
    root: "motion",
    status: "curated",
    word: "momentum",
  },
  pause: {
    definition: "a short stop that makes room for attention.",
    examples: ["A careful pause can make the sentence easier to hear."],
    mnemonic: "与 pose(摆姿势/停住) 同源，短暂地停住。",
    morphemes: ["pause"],
    partOfSpeech: "v. / n.",
    phonetic: "/pɔːz/",
    relatedWords: ["stop", "silence", "breath"],
    root: "stop",
    status: "curated",
    word: "pause",
  },
  rhythm: {
    definition: "a repeated pattern of movement, sound, or attention.",
    examples: ["A steady reading rhythm protects focus."],
    mnemonic: "源自希腊语 rhythmos(流动) → 重复的流动，即节奏。",
    morphemes: ["rhyth", "m"],
    partOfSpeech: "n.",
    phonetic: "/ˈrɪðəm/",
    relatedWords: ["pattern", "tempo", "cycle"],
    root: "flow",
    status: "curated",
    word: "rhythm",
  },
};

export const READING_SOURCES: ReadingSource[] = [
  {
    author: "Auris Editorial",
    category: "article",
    estimatedMinutes: 6,
    id: "quiet-momentum",
    kicker: "晨间精读",
    progress: 34,
    publishedAt: "2026-06-21",
    summary:
      "把阅读拆成一个可重复的小习惯：少一点阻力地回到同一页，靠小小的完成感累积动能，用稳定节奏守住注意力。",
    title: "Quiet Momentum",
    paragraphs: [
      {
        analysis: "This opening frames reading as a repeatable local routine, not a one-time task.",
        english: "Quiet momentum begins when a learner returns to the same page with less resistance.",
        id: "quiet-momentum-1",
        order: 1,
        translation: "安静的动能，来自学习者再次回到同一页时少了一点阻力。",
        wordKeys: ["momentum"],
      },
      {
        analysis: "The paragraph turns progress into a visible loop: read, notice, save, return.",
        english: "Small wins create momentum for the next page, especially when notes stay close to the paragraph.",
        id: "quiet-momentum-2",
        order: 2,
        translation: "小小的完成感会推动下一页，尤其当笔记始终贴近原段落时。",
        wordKeys: ["momentum", "alignment"],
      },
      {
        analysis: "The closing sentence connects calm pacing with long-term reading durability.",
        english: "A steady rhythm protects attention from turning practice into noise.",
        id: "quiet-momentum-3",
        order: 3,
        translation: "稳定的节奏会保护注意力，不让练习变成噪音。",
        wordKeys: ["rhythm"],
      },
    ],
  },
  {
    author: "Studio Team",
    category: "episode",
    estimatedMinutes: 8,
    id: "studio-notes",
    kicker: "Episode",
    progress: 18,
    publishedAt: "2026-06-14",
    summary:
      "从听到读的桥梁：把每个停顿当成学习线索，让译文靠近原文但不抢走页面中心。",
    title: "Studio Notes",
    paragraphs: [
      {
        analysis: "The sentence treats pauses as learnable signals, which fits a listening-to-reading bridge.",
        english: "Every pause becomes a cue for the learner.",
        id: "studio-notes-1",
        order: 1,
        translation: "节目组把每个停顿都当成学习线索。",
        wordKeys: ["pause", "cue"],
      },
      {
        analysis: "This paragraph explains why bilingual layout should reduce friction rather than decorate the page.",
        english: "The translation should sit nearby, but it should never steal the center of the room.",
        id: "studio-notes-2",
        order: 2,
        translation: "译文应该靠近原文，但不应该抢走页面中心。",
        wordKeys: ["alignment"],
      },
    ],
  },
  {
    author: "Auris Editorial",
    category: "favorite",
    estimatedMinutes: 4,
    id: "saved-fragments",
    kicker: "Favorites",
    progress: 72,
    publishedAt: "2026-06-07",
    summary:
      "收藏不是奖杯，而是注意力变清晰那一刻留下的标记——保存的是你为什么停下来。",
    title: "Saved Fragments",
    paragraphs: [
      {
        analysis: "A saved paragraph is valuable because it preserves the reason a learner stopped.",
        english: "A favorite is not a trophy; it is a marker for the moment attention became sharp.",
        id: "saved-fragments-1",
        order: 1,
        translation: "收藏不是奖杯，而是注意力变清晰的那一刻留下的标记。",
        wordKeys: ["cue"],
      },
    ],
  },
];
