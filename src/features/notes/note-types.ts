export type NoteBlockType =
  | "bullet"
  | "divider"
  | "heading"
  | "paragraph"
  | "quote"
  | "todo";

export type NoteBlock = {
  checked?: boolean;
  id: string;
  text: string;
  type: NoteBlockType;
};

export type NotePage = {
  blocks: NoteBlock[];
  fileName: string;
  frontmatter?: Record<string, unknown>;
  icon: string;
  id: string;
  markdownBody: string;
  relativePath: string;
  title: string;
  updatedAt: string;
};

export type NotePageSummary = Pick<
  NotePage,
  "fileName" | "icon" | "id" | "relativePath" | "title" | "updatedAt"
>;

export type NotesDirectoryInfo = {
  directoryName: string | null;
  isDesktopVault?: boolean;
  isConfigured: boolean;
  isSupported: boolean;
  pluginDirectory?: string | null;
  vaultPath?: string | null;
};

export type CreateNotePageInput = Partial<Pick<NotePage, "icon" | "title">>;

export type NotesStorage = {
  createPage: (input?: CreateNotePageInput) => Promise<NotePage>;
  deletePage: (id: string) => Promise<void>;
  getDirectoryInfo: () => Promise<NotesDirectoryInfo>;
  getPage: (id: string) => Promise<NotePage | null>;
  listPages: () => Promise<NotePageSummary[]>;
  pickDirectory: () => Promise<NotesDirectoryInfo>;
  savePage: (page: NotePage) => Promise<NotePageSummary>;
  searchPages?: (query: string) => Promise<NotePageSummary[]>;
  subscribeToChanges?: (listener: () => void) => () => void;
};
