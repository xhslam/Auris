import { sanitizeNoteFileName } from "@/features/notes/note-model";
import { getVaultBasename, normalizeVaultPath } from "@/features/notes/vault/vault-path";

type PersistAttachment = (path: string, content: Uint8Array) => Promise<void>;

export type PreparedImageInsertion = {
  alt: string;
  markdown: string;
  source: string;
  storagePath: string | null;
  title: string;
};

type PrepareImageInsertionInput = {
  createId?: () => string;
  file: File;
  notePath: string;
  persistAttachment?: PersistAttachment;
  readDataUrl?: (file: File) => Promise<string>;
};

function createAttachmentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2, 10);
}

function getFileStem(fileName: string) {
  const normalized = fileName.trim().replace(/^.*[\\/]/, "");
  const extensionIndex = normalized.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return normalized || "image";
  }

  return normalized.slice(0, extensionIndex) || "image";
}

function getFileExtension(file: File) {
  const fileName = file.name.trim().replace(/^.*[\\/]/, "");
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex > 0) {
    return fileName.slice(extensionIndex + 1).toLowerCase();
  }

  const mimeSubtype = file.type.split("/")[1]?.toLowerCase() ?? "";
  const sanitizedSubtype = mimeSubtype.replace(/[^a-z0-9]+/g, "");

  if (sanitizedSubtype === "jpeg") {
    return "jpg";
  }

  return sanitizedSubtype || "png";
}

function buildAttachmentFileName(notePath: string, file: File, id: string) {
  const noteStem = sanitizeNoteFileName(getVaultBasename(notePath) || "note");
  const fileStem = sanitizeNoteFileName(getFileStem(file.name));
  const extension = getFileExtension(file);

  return `${noteStem}-${fileStem}-${id}.${extension}`;
}

export function buildImageAttachmentPaths(
  notePath: string,
  file: File,
  id: string,
) {
  const fileName = buildAttachmentFileName(notePath, file, id);
  const noteDirectory = normalizeVaultPath(notePath).split("/").slice(0, -1).join("/");
  const referencePath = `assets/${fileName}`;

  return {
    referencePath,
    storagePath: noteDirectory ? `${noteDirectory}/${referencePath}` : referencePath,
  };
}

export async function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error("无法读取图片文件。"));
    };

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };

    reader.readAsDataURL(file);
  });
}

function buildMarkdownImageSource(alt: string, source: string, title = "") {
  const safeAlt = alt.replace(/[\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ");
  return title ? `![${safeAlt}](${source} "${title}")` : `![${safeAlt}](${source})`;
}

export async function prepareImageInsertion(
  input: PrepareImageInsertionInput,
): Promise<PreparedImageInsertion> {
  validateNotesImageFile(input.file);
  const alt = getFileStem(input.file.name);
  const title = "";
  const usePersistedAttachment = Boolean(input.persistAttachment);

  if (usePersistedAttachment) {
    const id = input.createId?.() ?? createAttachmentId();
    const { referencePath, storagePath } = buildImageAttachmentPaths(input.notePath, input.file, id);
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    await input.persistAttachment!(storagePath, bytes);
    return {
      alt,
      markdown: buildMarkdownImageSource(alt, referencePath, title),
      source: referencePath,
      storagePath,
      title,
    };
  }

  const source = await (input.readDataUrl ?? readImageFileAsDataUrl)(input.file);

  return {
    alt,
    markdown: buildMarkdownImageSource(alt, source, title),
    source,
    storagePath: null,
    title,
  };
}

// Keep accepted formats consistent with the Notes safe data-image renderer.
export const NOTES_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif)$/i;
const IMAGE_MIME = /^image\/(?:png|jpe?g|gif|webp|avif)$/i;

export function collectNotesImageFiles(transfer: Pick<DataTransfer, "files" | "items"> | null | undefined): File[] {
  const files = Array.from(transfer?.files ?? []);
  if (files.length === 0) {
    for (const item of Array.from(transfer?.items ?? [])) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  // Claim unsupported image formats too, so the user receives a useful error
  // instead of ProseMirror inserting an ephemeral blob URL.
  return files.filter((file) => file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name));
}

export function validateNotesImageFile(file: File) {
  if (!(file.type ? IMAGE_MIME.test(file.type) : IMAGE_EXTENSION.test(file.name))) {
    throw new Error("请选择 PNG、JPEG、GIF、WebP 或 AVIF 图片。");
  }
  if (file.size === 0) throw new Error("图片文件为空。");
  if (file.size > NOTES_IMAGE_MAX_BYTES) throw new Error("单张图片不能超过 20 MB。");
}
