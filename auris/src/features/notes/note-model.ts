import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import type {
  CreateNotePageInput,
  NoteBlock,
  NoteBlockType,
  NotePage,
} from "@/features/notes/note-types";

const DEFAULT_NOTE_ICON = "文";
const DEFAULT_NOTE_BODY =
  "## 今日笔记\n\n在这里整理今天的跟读重点、难句、发音提醒和复盘。";

export type SlashCommandDefinition = {
  aliases: string[];
  description: string;
  label: string;
  snippet: string;
  type: NoteBlockType;
};

const SLASH_COMMANDS = [
  {
    aliases: ["p", "正文", "段落"],
    description: "插入普通段落",
    label: "正文段落",
    snippet: "",
    type: "paragraph" as const,
  },
  {
    aliases: ["h", "标题", "小标题"],
    description: "插入一级标题",
    label: "小标题",
    snippet: "# ",
    type: "heading" as const,
  },
  {
    aliases: ["todo", "待办", "任务"],
    description: "插入待办清单项",
    label: "待办清单",
    snippet: "- [ ] ",
    type: "todo" as const,
  },
  {
    aliases: ["bullet", "列表", "项目"],
    description: "插入项目符号列表",
    label: "项目符号",
    snippet: "- ",
    type: "bullet" as const,
  },
  {
    aliases: ["quote", "引用"],
    description: "插入引用块",
    label: "引用摘要",
    snippet: "> ",
    type: "quote" as const,
  },
  {
    aliases: ["divider", "分割", "横线"],
    description: "插入分割线",
    label: "分割线",
    snippet: "---\n\n",
    type: "divider" as const,
  },
] satisfies SlashCommandDefinition[];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeNoteFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled-note"
  );
}

export function createStableNoteIdFromFileName(fileName: string) {
  const baseName = fileName.replace(/\.md$/i, "");
  return `note-${sanitizeNoteFileName(baseName)}`;
}

export function createNoteBlock(type: NoteBlockType, text = ""): NoteBlock {
  return {
    checked: type === "todo" ? false : undefined,
    id: createId("block"),
    text,
    type,
  };
}

export function createNotePage(
  input?: Partial<
    CreateNotePageInput &
      Pick<NotePage, "blocks" | "fileName" | "frontmatter" | "id" | "markdownBody" | "relativePath" | "updatedAt">
  >,
): NotePage {
  const id = input?.id ?? createId("note");
  const title = input?.title ?? "学习笔记";
  const resolvedFileName = input?.fileName ?? `${sanitizeNoteFileName(title)}--${id}.md`;
  const markdownBody = input?.markdownBody ?? DEFAULT_NOTE_BODY;

  return {
    blocks: input?.blocks ?? [createNoteBlock("paragraph", markdownBody)],
    fileName: resolvedFileName,
    frontmatter: input?.frontmatter,
    icon: input?.icon ?? DEFAULT_NOTE_ICON,
    id,
    markdownBody,
    relativePath: input?.relativePath ?? resolvedFileName,
    title,
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  };
}

export function reorderNoteBlocks(
  blocks: NoteBlock[],
  draggedBlockId: string,
  targetBlockId: string,
) {
  const draggedIndex = blocks.findIndex((block) => block.id === draggedBlockId);
  const targetIndex = blocks.findIndex((block) => block.id === targetBlockId);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return blocks;
  }

  const nextBlocks = [...blocks];
  const [draggedBlock] = nextBlocks.splice(draggedIndex, 1);
  nextBlocks.splice(targetIndex, 0, draggedBlock);
  return nextBlocks;
}

export function resolveSlashCommandMatches(value: string) {
  const normalized = value.trim().replace(/^\//, "").toLowerCase();

  return SLASH_COMMANDS.filter((command) => {
    if (!normalized) {
      return true;
    }

    return (
      command.label.toLowerCase().includes(normalized) ||
      command.aliases.some((alias) => alias.toLowerCase().includes(normalized))
    );
  });
}

export function getSlashCommandDefinitions() {
  return [...SLASH_COMMANDS];
}

function joinMarkdownSections(sections: string[]) {
  return sections.filter(Boolean).join("\n\n").trim();
}

export function buildWordMarkdownSnippet(record: SavedWordRecord) {
  const definitions = record.definitions.map((definition) => `- ${definition}`);
  const synonyms =
    record.synonyms.length > 0 ? [`- 同义词：${record.synonyms.join("、")}`] : [];

  return joinMarkdownSections([
    `## 单词：${record.word}`,
    `- 词性：${record.lexicalCategory}`,
    ...definitions,
    ...synonyms,
    `> 来源：${record.sourceLabel}`,
  ]);
}

export function buildSentenceMarkdownSnippet(record: SavedSentenceRecord) {
  return joinMarkdownSections([
    "## 句子收藏",
    `> ${record.text}`,
    record.translation ? `- 释义：${record.translation}` : "",
    `- 来源：${record.sourceLabel}`,
  ]);
}

export function getDefaultNoteIcon() {
  return DEFAULT_NOTE_ICON;
}

export function createNoteId(prefix = "note") {
  return createId(prefix);
}
