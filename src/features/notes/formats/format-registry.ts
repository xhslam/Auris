export type NotesFormatId =
  | "attachment"
  | "audio"
  | "csv"
  | "json"
  | "jsonl"
  | "markdown"
  | "text"
  | "toml"
  | "tsv"
  | "unknown-text"
  | "yaml";

export type NotesFormatDescriptor = Readonly<{
  canEdit: boolean;
  extensions: readonly string[];
  id: NotesFormatId;
  label: string;
  previewKind: "markdown" | "none" | "structured-tree";
}>;

function format(
  descriptor: Omit<NotesFormatDescriptor, "extensions"> & {
    extensions: string[];
  },
): NotesFormatDescriptor {
  return Object.freeze({
    ...descriptor,
    extensions: Object.freeze([...descriptor.extensions]),
  });
}

const REGISTERED_FORMATS = Object.freeze([
  format({
    canEdit: true,
    extensions: [".md", ".markdown", ".mdown", ".mdx", ".mkdn"],
    id: "markdown",
    label: "Markdown",
    previewKind: "markdown",
  }),
  format({
    canEdit: true,
    extensions: [".csv"],
    id: "csv",
    label: "CSV",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: true,
    extensions: [".tsv"],
    id: "tsv",
    label: "TSV",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: true,
    extensions: [".conf", ".env", ".ini", ".log", ".properties", ".text", ".txt"],
    id: "text",
    label: "Plain text",
    previewKind: "none",
  }),
  format({
    canEdit: true,
    extensions: [".json"],
    id: "json",
    label: "JSON",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: true,
    extensions: [".jsonl"],
    id: "jsonl",
    label: "JSON Lines",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: true,
    extensions: [".yaml", ".yml"],
    id: "yaml",
    label: "YAML",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: true,
    extensions: [".toml"],
    id: "toml",
    label: "TOML",
    previewKind: "structured-tree",
  }),
  format({
    canEdit: false,
    extensions: [
      ".aac",
      ".flac",
      ".m4a",
      ".mp3",
      ".ogg",
      ".oga",
      ".opus",
      ".wav",
    ],
    id: "audio",
    label: "Audio",
    previewKind: "none",
  }),
  format({
    canEdit: false,
    extensions: [
      ".7z",
      ".avi",
      ".bmp",
      ".doc",
      ".docx",
      ".gif",
      ".gz",
      ".heic",
      ".ico",
      ".jpeg",
      ".jpg",
      ".mkv",
      ".mov",
      ".mp4",
      ".pdf",
      ".png",
      ".ppt",
      ".pptx",
      ".rar",
      ".svgz",
      ".tar",
      ".tif",
      ".tiff",
      ".webm",
      ".webp",
      ".xls",
      ".xlsx",
      ".zip",
    ],
    id: "attachment",
    label: "Attachment",
    previewKind: "none",
  }),
]);

const UNKNOWN_TEXT_FORMAT = format({
  canEdit: true,
  extensions: [],
  id: "unknown-text",
  label: "Plain text (fallback)",
  previewKind: "none",
});

const FORMAT_BY_EXTENSION = new Map(
  REGISTERED_FORMATS.flatMap((descriptor) =>
    descriptor.extensions.map((extension) => [extension, descriptor] as const),
  ),
);

function extensionOf(filePath: string) {
  const fileName = filePath.replace(/\\/g, "/").split("/").at(-1) ?? filePath;
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(index).toLowerCase() : "";
}

export function listRegisteredFormats(): readonly NotesFormatDescriptor[] {
  return REGISTERED_FORMATS;
}

export function getFormatDescriptor(filePath: string): NotesFormatDescriptor {
  return FORMAT_BY_EXTENSION.get(extensionOf(filePath)) ?? UNKNOWN_TEXT_FORMAT;
}
