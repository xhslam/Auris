import type { NotesFormatId } from "@/features/notes/formats/format-registry";
export type NoteHeadingIndex = {
  depth: number;
  line: number;
  slug: string;
  text: string;
};

export type NoteWikiLinkIndex = {
  alias: string | null;
  heading: string | null;
  target: string;
};

export type NoteTaskIndex = {
  checked: boolean;
  line: number;
  text: string;
};

export type ParsedNoteIndex = {
  backlinks: string[];
  embeds: string[];
  headings: NoteHeadingIndex[];
  links: NoteWikiLinkIndex[];
  tags: string[];
  tasks: NoteTaskIndex[];
  title: string | null;
  wordCount: number;
};

export type NoteDocument = {
  basename: string;
  fileName: string;
  formatId?: NotesFormatId;
  frontmatter: Record<string, unknown>;
  mtime: string | null;
  parsed: ParsedNoteIndex;
  path: string;
  rawSource: string;
};
