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
  return title ? `![${alt}](${source} "${title}")` : `![${alt}](${source})`;
}

export async function prepareImageInsertion(
  input: PrepareImageInsertionInput,
): Promise<PreparedImageInsertion> {
  const alt = getFileStem(input.file.name);
  const title = "";
  const usePersistedAttachment = Boolean(input.persistAttachment);

  if (usePersistedAttachment) {
    try {
      const id = input.createId?.() ?? createAttachmentId();
      const { referencePath, storagePath } = buildImageAttachmentPaths(
        input.notePath,
        input.file,
        id,
      );
      const bytes = new Uint8Array(await input.file.arrayBuffer());

      await input.persistAttachment?.(storagePath, bytes);

      return {
        alt,
        markdown: buildMarkdownImageSource(alt, referencePath, title),
        source: referencePath,
        storagePath,
        title,
      };
    } catch {
      // Fall back to an embedded data URL so the paste/drop action still succeeds.
    }
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
