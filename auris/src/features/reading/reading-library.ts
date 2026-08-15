import type { ReadingSource } from "@/features/reading/reading-fixtures";

/** 内容库的分类筛选维度。 */
export type ReadingLibraryFilter =
  | "all"
  | "article"
  | "book"
  | "exam"
  | "favorite"
  | "history"
  | "episode";

export const READING_FILTER_ORDER: ReadingLibraryFilter[] = [
  "all",
  "article",
  "book",
  "exam",
  "favorite",
  "history",
];

export const READING_FILTER_LABELS: Record<ReadingLibraryFilter, string> = {
  all: "全部",
  article: "文章",
  book: "书籍",
  exam: "题目",
  favorite: "收藏",
  history: "历史",
  episode: "剧集",
};

/** 侧栏「阅读精选」树使用的文案。 */
export const READING_SIDEBAR_FILTER_LABELS: Record<ReadingLibraryFilter, string> =
  {
    all: "阅读概览",
    article: "文章",
    book: "书籍",
    exam: "题目",
    favorite: "收藏夹",
    history: "阅读历史",
    episode: "剧集",
  };

/** 阅读精选下的子分类。 */
export const READING_CURATED_CHILD_FILTERS: ReadingLibraryFilter[] = [
  "article",
  "book",
  "exam",
];

export const READING_LIBRARY_FILTERS: readonly ReadingLibraryFilter[] = [
  "all",
  "article",
  "book",
  "exam",
  "favorite",
  "history",
  "episode",
] as const;

export function isReadingLibraryFilter(
  value: string | null | undefined,
): value is ReadingLibraryFilter {
  return (
    typeof value === "string" &&
    (READING_LIBRARY_FILTERS as readonly string[]).includes(value)
  );
}

export function parseReadingLibraryFilter(
  value: string | null | undefined,
): ReadingLibraryFilter {
  return isReadingLibraryFilter(value) ? value : "all";
}

export function readingLibraryHref(filter: ReadingLibraryFilter = "all"): string {
  if (filter === "all") {
    return "/reading";
  }
  return `/reading?filter=${filter}`;
}

export type ReadingDateGroup = {
  /** 原始 publishedAt（YYYY-MM-DD），无日期为 "" */
  date: string;
  /** 展示用日期，如 2026.06.21；无日期为「未分组」 */
  label: string;
  sources: ReadingSource[];
};

/** YYYY-MM-DD → 2026.06.21；无值 → 未分组。 */
export function formatReadingDate(date: string | undefined): string {
  if (!date) {
    return "未分组";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) {
    return date;
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/** 按 publishedAt 分组，日期降序；无日期分组排在最后。 */
export function groupSourcesByDate(sources: ReadingSource[]): ReadingDateGroup[] {
  const map = new Map<string, ReadingSource[]>();
  for (const source of sources) {
    const key = source.publishedAt ?? "";
    const list = map.get(key) ?? [];
    list.push(source);
    map.set(key, list);
  }

  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === b) {
      return 0;
    }
    if (a === "") {
      return 1;
    }
    if (b === "") {
      return -1;
    }
    return a < b ? 1 : -1;
  });

  return keys.map((key) => ({
    date: key,
    label: formatReadingDate(key || undefined),
    sources: map.get(key) ?? [],
  }));
}

/** 按分类 / 收藏 / 阅读历史筛选内容源。 */
export function filterSources(
  sources: ReadingSource[],
  filter: ReadingLibraryFilter,
  favoriteIds: ReadonlySet<string>,
  progressById: Readonly<Record<string, number>> = {},
): ReadingSource[] {
  if (filter === "all") {
    return sources;
  }
  if (filter === "favorite") {
    return sources.filter((source) => favoriteIds.has(source.id));
  }
  if (filter === "history") {
    return sources.filter((source) => {
      const progress = progressById[source.id] ?? source.progress ?? 0;
      return progress > 0;
    });
  }
  if (filter === "exam") {
    return sources.filter(
      (source) =>
        source.category === "exam" || (source.examSections?.length ?? 0) > 0,
    );
  }
  return sources.filter((source) => source.category === filter);
}
