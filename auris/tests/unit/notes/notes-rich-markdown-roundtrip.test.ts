import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

const CORPUS_DIRECTORY = path.resolve("tests/fixtures/notes/roundtrip");
const CORPUS_FILES = [
  "basic-cjk.md",
  "lists-and-quotes.md",
  "code-and-math.md",
  "table-and-links.md",
  "escaping-and-breaks.md",
] as const;

function canonicalize(source: string) {
  return serializeNotesRichMarkdown(parseNotesRichMarkdown(source));
}

function expectStableRoundTrip(source: string) {
  const canonical = canonicalize(source);
  const reparsed = parseNotesRichMarkdown(canonical);

  expect(serializeNotesRichMarkdown(reparsed)).toBe(canonical);
  expect(reparsed.toJSON()).toEqual(parseNotesRichMarkdown(canonical).toJSON());
  return canonical;
}

const GENERATED_INLINE_ATOMS = [
  "plain text",
  "**bold**",
  "*italic*",
  "`inline()`",
  "[link](https://example.com)",
  "[[语法#Tenses|时态]]",
  "$v = at$",
] as const;

const GENERATED_CASES = Array.from({ length: 96 }, (_, index) => {
  const atoms = Array.from({ length: 4 }, (__, offset) =>
    GENERATED_INLINE_ATOMS[(index + offset * 3) % GENERATED_INLINE_ATOMS.length],
  );
  const fence = index % 3 === 0
    ? `\n\n\`\`\`text\ncase-${index}: 中文 English\n\`\`\``
    : "";
  const list = index % 2 === 0
    ? `\n\n- item ${index}\n- ${atoms[1]}`
    : `\n\n1. item ${index}\n2. ${atoms[2]}`;

  return `## Generated ${index}\n\n${atoms.join(" · ")}${list}${fence}`;
});

describe("notes rich markdown round-trip integrity", () => {
  it.each(CORPUS_FILES)(
    "reaches a stable canonical representation for %s",
    (fileName) => {
      const source = readFileSync(
        path.join(CORPUS_DIRECTORY, fileName),
        "utf8",
      );

      expectStableRoundTrip(source);
    },
  );

  it("preserves Auris semantic atoms across the corpus boundary", () => {
    const basic = canonicalize(
      readFileSync(path.join(CORPUS_DIRECTORY, "basic-cjk.md"), "utf8"),
    );
    const codeAndMath = canonicalize(
      readFileSync(path.join(CORPUS_DIRECTORY, "code-and-math.md"), "utf8"),
    );
    const table = canonicalize(
      readFileSync(path.join(CORPUS_DIRECTORY, "table-and-links.md"), "utf8"),
    );

    expect(basic).toContain("[[语法卡片#Tenses|时态说明]]");
    expect(codeAndMath).toContain("const greeting = \"你好, Auris\";");
    expect(codeAndMath).toContain("$v = at$");
    expect(codeAndMath).toContain("F_t = F_f + F_w + F_i + F_j");
    expect(table).toContain("[[知识库\\|知识库入口]]");
    expect(table).toContain("[外部资料](https://example.com/resource)");
  });

  it("is idempotent for deterministically generated block and inline combinations", () => {
    GENERATED_CASES.forEach((source) => {
      expectStableRoundTrip(source);
    });
  });
});
