"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  READING_CURATED_CHILD_FILTERS,
  READING_SIDEBAR_FILTER_LABELS,
  isReadingLibraryImportMode,
  parseReadingLibraryFilter,
  readingLibraryHref,
  readingLibraryImportHref,
  type ReadingLibraryFilter,
} from "@/features/reading/reading-library";

function CuratedGlyph() {
  return (
    <svg aria-hidden="true" className="desktop-reading-nav__glyph" viewBox="0 0 24 24">
      <path
        d="M5 7h6v4H5V7Zm8 0h6v6h-6V7ZM5 13h6v4H5v-4Zm8 4h6v-2h-6v2Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

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

function ImportGlyph() {
  return (
    <svg aria-hidden="true" className="desktop-reading-nav__glyph" viewBox="0 0 24 24">
      <path
        d="M6 4.5h9a3 3 0 0 1 3 3v12H8a2 2 0 0 1-2-2v-13Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M12 8.5v6M9.5 12 12 14.5 14.5 12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ChevronGlyph({ open }: { open?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="desktop-reading-nav__chevron-icon"
      data-open={open ? "true" : "false"}
      viewBox="0 0 16 16"
    >
      <path
        d={open ? "M4.5 6.25 8 9.75l3.5-3.5" : "M6.25 4.5 9.75 8l-3.5 3.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
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
      return <CuratedGlyph />;
  }
}

/** 阅读精选手风琴：文章 / 书籍 / 题目 / 导入。 */
export function DesktopReadingSidebarNav() {
  const searchParams = useSearchParams();
  const activeFilter = parseReadingLibraryFilter(searchParams.get("filter"));
  const isImportActive = isReadingLibraryImportMode(searchParams.get("import"));
  const curatedChildActive =
    READING_CURATED_CHILD_FILTERS.includes(activeFilter) || isImportActive;
  const [isCuratedOpen, setIsCuratedOpen] = useState(true);

  return (
    <section
      aria-label="阅读分类导航"
      className="desktop-reading-nav"
      data-library-open={isCuratedOpen ? "true" : "false"}
    >
      <div className="desktop-reading-nav__block">
        <button
          aria-expanded={isCuratedOpen}
          className="desktop-reading-nav__row desktop-reading-nav__row--parent"
          data-active={curatedChildActive ? "true" : "false"}
          onClick={() => setIsCuratedOpen((open) => !open)}
          type="button"
        >
          <span className="desktop-reading-nav__leading">
            <span className="desktop-reading-nav__mark" aria-hidden="true">
              <CuratedGlyph />
            </span>
            <span className="desktop-reading-nav__label">阅读精选</span>
          </span>
          <span className="desktop-reading-nav__trailing" aria-hidden="true">
            <ChevronGlyph open={isCuratedOpen} />
          </span>
        </button>

        {isCuratedOpen ? (
          <ul className="desktop-reading-nav__children">
            {READING_CURATED_CHILD_FILTERS.map((filter) => (
              <li key={filter}>
                <Link
                  aria-current={
                    !isImportActive && activeFilter === filter ? "page" : undefined
                  }
                  className="desktop-reading-nav__row desktop-reading-nav__row--child"
                  data-active={
                    !isImportActive && activeFilter === filter ? "true" : "false"
                  }
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
            <li>
              <Link
                aria-current={isImportActive ? "page" : undefined}
                className="desktop-reading-nav__row desktop-reading-nav__row--child"
                data-active={isImportActive ? "true" : "false"}
                href={readingLibraryImportHref()}
              >
                <span className="desktop-reading-nav__leading">
                  <span className="desktop-reading-nav__mark" aria-hidden="true">
                    <ImportGlyph />
                  </span>
                  <span className="desktop-reading-nav__label">导入</span>
                </span>
              </Link>
            </li>
          </ul>
        ) : null}
      </div>
    </section>
  );
}
