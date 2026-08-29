"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  READING_CURATED_CHILD_FILTERS,
  READING_SIDEBAR_FILTER_LABELS,
  parseReadingLibraryFilter,
  readingLibraryHref,
  type ReadingLibraryFilter,
} from "@/features/reading/reading-library";

function ArticleGlyph() {
  return (
    <svg aria-hidden="true" className="desktop-reading-nav__glyph" viewBox="0 0 24 24">
      <path
        d="M7 5h10a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 17 19H7a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 7 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9 9h6M9 12.5h6M9 16h3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg aria-hidden="true" className="desktop-reading-nav__glyph" viewBox="0 0 24 24">
      <path
        d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11a2.5 2.5 0 0 0-2.5-2.5H5V5.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M19 5.5h-6.5A2.5 2.5 0 0 0 10 8v11a2.5 2.5 0 0 1 2.5-2.5H19V5.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ExamGlyph() {
  return (
    <svg aria-hidden="true" className="desktop-reading-nav__glyph" viewBox="0 0 24 24">
      <path
        d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9 9h6M9 12.5h6M9 16h2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function filterGlyph(filter: ReadingLibraryFilter) {
  switch (filter) {
    case "article":
      return <ArticleGlyph />;
    case "book":
      return <BookGlyph />;
    case "exam":
      return <ExamGlyph />;
    default:
      return <ArticleGlyph />;
  }
}

/** Reading 区的三个平级栏目：文章 / 书籍 / 题目。 */
export function DesktopReadingSidebarNav() {
  const searchParams = useSearchParams();
  const activeFilter = parseReadingLibraryFilter(searchParams.get("filter"));

  return (
    <section
      aria-label="阅读分类导航"
      className="desktop-reading-nav"
      data-flat="true"
    >
      <div className="desktop-reading-nav__block">
        <ul className="desktop-reading-nav__children">
          {READING_CURATED_CHILD_FILTERS.map((filter) => (
            <li key={filter}>
              <Link
                aria-current={activeFilter === filter ? "page" : undefined}
                className="desktop-reading-nav__row desktop-reading-nav__row--child"
                data-active={activeFilter === filter ? "true" : "false"}
                href={readingLibraryHref(filter)}
              >
                <span className="desktop-reading-nav__leading">
                  <span className="desktop-reading-nav__mark" aria-hidden="true">
                    {filterGlyph(filter)}
                  </span>
                  <span className="desktop-reading-nav__label">
                    {READING_SIDEBAR_FILTER_LABELS[filter]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
