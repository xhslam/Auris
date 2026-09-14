import { describe, expect, it } from "vitest";
import {
  buildTagOptions,
  buildSlashCommandOptions,
  buildWikiLinkOptions,
} from "@/features/notes/editor/editor-completions";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(
  path: string,
  options?: {
    tags?: string[];
    title?: string | null;
  },
): NoteDocument {
  return {
    basename: path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "note",
    fileName: path.split("/").at(-1) ?? "note.md",
    frontmatter: {},
    mtime: "2026-04-04T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: options?.tags ?? [],
      tasks: [],
      title: options?.title ?? null,
      wordCount: 0,
    },
    path,
    rawSource: options?.title ? `# ${options.title}` : "",
  };
}

describe("editor-completions", () => {
  it("builds wiki link options from vault documents and keeps duplicate basenames path-safe", () => {
    const options = buildWikiLinkOptions([
      createDocument("Inbox/Daily Review.md", { title: "Daily Review" }),
      createDocument("Archive/Daily Review.md", { title: "Daily Review Archive" }),
      createDocument("Grammar/Linking.md", { title: "Linking" }),
    ]);

    expect(options.map((option) => option.apply)).toEqual([
      "[[Inbox/Daily Review]]",
      "[[Archive/Daily Review]]",
      "[[Linking]]",
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "Daily Review",
      "Daily Review Archive",
      "Linking",
    ]);
  });

  it("builds sorted unique tag options from the live vault index", () => {
    const options = buildTagOptions([
      createDocument("Inbox/Daily Review.md", {
        tags: ["shadowing", "pronunciation"],
      }),
      createDocument("Grammar/Linking.md", {
        tags: ["pronunciation", "linking"],
      }),
    ]);

    expect(options.map((option) => option.apply)).toEqual([
      "#linking",
      "#pronunciation",
      "#shadowing",
    ]);
  });

  it("builds slash command options for block insertion shortcuts", () => {
    const options = buildSlashCommandOptions("待办");

    expect(options.map((option) => option.label)).toEqual(["待办清单"]);
    expect(options.map((option) => option.apply)).toEqual(["- [ ] "]);
    expect(options[0]?.detail).toBe("插入待办清单项");
  });

  it("shows the full slash menu when the query is empty", () => {
    const options = buildSlashCommandOptions("");

    expect(options.map((option) => option.label)).toEqual([
      "正文段落",
      "小标题",
      "待办清单",
      "项目符号",
      "引用摘要",
      "分割线",
    ]);
  });
});
