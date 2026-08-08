import { describe, expect, it } from "vitest";
import YAML from "yaml";

import { setNoteTags } from "@/features/notes/documents/note-tags";

function frontmatterOf(source: string): Record<string, unknown> {
  const end = source.indexOf("\n---\n", 3);
  return YAML.parse(source.slice(4, end)) as Record<string, unknown>;
}

describe("setNoteTags", () => {
  it("adds a frontmatter block when none exists, leaving the body intact", () => {
    const result = setNoteTags("# 标题\n\n正文内容", ["读书", "心理"]);
    expect(result.startsWith("---\n")).toBe(true);
    expect(frontmatterOf(result).tags).toEqual(["读书", "心理"]);
    expect(result).toContain("# 标题\n\n正文内容");
  });

  it("supports CJK tags", () => {
    const result = setNoteTags("hello", ["心理学"]);
    expect(frontmatterOf(result).tags).toEqual(["心理学"]);
  });

  it("replaces existing tags while preserving other frontmatter keys and body", () => {
    const source = '---\ntitle: "My Note"\ntags:\n  - old\n---\n\n# Body\n\ntext';
    const result = setNoteTags(source, ["fresh", "新"]);
    const fm = frontmatterOf(result);
    expect(fm.title).toBe("My Note");
    expect(fm.tags).toEqual(["fresh", "新"]);
    expect(result.endsWith("# Body\n\ntext")).toBe(true);
  });

  it("replaces an inline tags array form", () => {
    const source = "---\ntags: [a, b]\nicon: 📓\n---\n\nbody";
    const result = setNoteTags(source, ["c"]);
    const fm = frontmatterOf(result);
    expect(fm.tags).toEqual(["c"]);
    expect(fm.icon).toBe("📓");
  });

  it("drops the frontmatter block entirely when clearing the only key", () => {
    const result = setNoteTags("---\ntags:\n  - solo\n---\n\nbody", []);
    expect(result).toBe("body");
  });

  it("dedupes and strips leading hashes", () => {
    const result = setNoteTags("x", ["#dup", "dup", "  spaced  "]);
    expect(frontmatterOf(result).tags).toEqual(["dup", "spaced"]);
  });

  it("returns the source unchanged when there is nothing to write", () => {
    expect(setNoteTags("plain body", [])).toBe("plain body");
  });
});
