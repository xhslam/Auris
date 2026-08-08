import { createNotePage, sanitizeNoteFileName } from "@/features/notes/note-model";
import type { NotePage, NotesStorage } from "@/features/notes/note-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import type { SessionSourceType } from "@/features/sessions/session.types";
import { splitIntoSentences } from "@/features/text/sentence-segmentation";

const SOURCE_EXCERPTS_MARKER = "<!-- shadowing:excerpts -->";
const SOURCE_VOCABULARY_MARKER = "<!-- shadowing:vocabulary -->";
const EMPTY_EXCERPTS_COPY = "_No saved excerpts yet._";
const EMPTY_VOCABULARY_COPY = "_No saved words yet._";

export type SourceMaterialNoteInput = {
  audioPath?: string | null;
  createdAt: string;
  originalText?: string | null;
  sourceType: SessionSourceType;
  sourceUrl?: string | null;
  text: string;
  title: string;
};

export type SourceMaterialNoteRef = {
  id: string;
  relativePath: string;
  title: string;
};

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function createSourceMaterialId(input: SourceMaterialNoteInput) {
  return `source-${stableHash(
    [
      input.sourceType,
      input.sourceUrl ?? "",
      input.title,
      normalizeText(input.originalText || input.text),
    ].join("\n"),
  )}`;
}

function buildSourceMaterialBody(input: SourceMaterialNoteInput) {
  const originalText = normalizeText(input.originalText || input.text);
  const sentences = splitIntoSentences(input.text);

  return [
    "## Original",
    "",
    originalText,
    "",
    "## Sentences",
    "",
    ...(sentences.length > 0
      ? sentences.map((sentence, index) => `${index + 1}. ${sentence}`)
      : ["_No sentence split available._"]),
    "",
    "## Excerpts",
    "",
    SOURCE_EXCERPTS_MARKER,
    EMPTY_EXCERPTS_COPY,
    "",
    "## Vocabulary",
    "",
    SOURCE_VOCABULARY_MARKER,
    EMPTY_VOCABULARY_COPY,
    "",
    "## Notes",
    "",
    "- ",
  ].join("\n");
}

function toSourceMaterialRef(page: NotePage): SourceMaterialNoteRef {
  return {
    id: page.id,
    relativePath: page.relativePath,
    title: page.title,
  };
}

function getFrontmatterString(
  frontmatter: Record<string, unknown> | undefined,
  key: string,
) {
  const value = frontmatter?.[key];
  return typeof value === "string" ? value : null;
}

export function buildSourceMaterialNotePage(input: SourceMaterialNoteInput) {
  const id = createSourceMaterialId(input);
  const fileName = `${sanitizeNoteFileName(input.title)}--${id}.md`;

  return createNotePage({
    fileName,
    frontmatter: {
      audioPath: input.audioPath ?? null,
      createdAt: input.createdAt,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      tags: ["english", "shadowing", "source-material"],
      type: "source-material",
    },
    icon: "S",
    id,
    markdownBody: buildSourceMaterialBody(input),
    relativePath: `Sources/${fileName}`,
    title: input.title,
    updatedAt: input.createdAt,
  });
}

function removeEmptyCopy(section: string, emptyCopy: string) {
  return section.replace(`\n${emptyCopy}`, "").replace(emptyCopy, "");
}

function appendAfterMarker(
  body: string,
  marker: string,
  emptyCopy: string,
  line: string,
) {
  if (body.includes(line)) {
    return body;
  }

  const markerIndex = body.indexOf(marker);

  if (markerIndex === -1) {
    return `${body.trimEnd()}\n\n${marker}\n${line}\n`;
  }

  const insertIndex = markerIndex + marker.length;
  const before = body.slice(0, insertIndex);
  const after = removeEmptyCopy(body.slice(insertIndex), emptyCopy);
  return `${before}\n${line}${after}`;
}

export function appendSentenceToSourceMaterialBody(
  body: string,
  sentence: SavedSentenceRecord,
) {
  const source = sentence.sourceNotePath
    ? ` source: [[${sentence.sourceNotePath}]]`
    : "";
  const translation = sentence.translation ? ` translation: ${sentence.translation}` : "";

  return appendAfterMarker(
    body,
    SOURCE_EXCERPTS_MARKER,
    EMPTY_EXCERPTS_COPY,
    `- [${sentence.id}] ${sentence.text}${translation}${source}`,
  );
}

export function appendWordToSourceMaterialBody(
  body: string,
  word: SavedWordRecord,
) {
  const definition = word.definitions[0] ?? word.sourceLabel;
  const synonyms =
    word.synonyms.length > 0 ? ` synonyms: ${word.synonyms.join(", ")}` : "";
  const source = word.sourceNotePath ? ` source: [[${word.sourceNotePath}]]` : "";

  return appendAfterMarker(
    body,
    SOURCE_VOCABULARY_MARKER,
    EMPTY_VOCABULARY_COPY,
    `- **${word.word}** _(${word.lexicalCategory})_ - ${definition}${synonyms}${source}`,
  );
}

export async function saveSourceMaterialNote(
  notesStorage: NotesStorage,
  input: SourceMaterialNoteInput,
) {
  const draftPage = buildSourceMaterialNotePage(input);
  const existingPage = await notesStorage.getPage(draftPage.id);
  const nextPage = existingPage
    ? {
        ...existingPage,
        frontmatter: {
          ...(existingPage.frontmatter ?? {}),
          audioPath: input.audioPath ?? existingPage.frontmatter?.audioPath ?? null,
          createdAt:
            getFrontmatterString(existingPage.frontmatter, "createdAt") ??
            input.createdAt,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl ?? null,
          type: "source-material",
        },
      }
    : draftPage;

  await notesStorage.savePage(nextPage);
  return toSourceMaterialRef(nextPage);
}

export async function appendSentenceToSourceMaterialNote(
  notesStorage: NotesStorage,
  sourceNote: SourceMaterialNoteRef,
  sentence: SavedSentenceRecord,
) {
  const page = await notesStorage.getPage(sourceNote.id);

  if (!page) {
    return null;
  }

  const nextPage = {
    ...page,
    markdownBody: appendSentenceToSourceMaterialBody(page.markdownBody, sentence),
  };

  await notesStorage.savePage(nextPage);
  return toSourceMaterialRef(nextPage);
}

export async function appendWordToSourceMaterialNote(
  notesStorage: NotesStorage,
  sourceNote: SourceMaterialNoteRef,
  word: SavedWordRecord,
) {
  const page = await notesStorage.getPage(sourceNote.id);

  if (!page) {
    return null;
  }

  const nextPage = {
    ...page,
    markdownBody: appendWordToSourceMaterialBody(page.markdownBody, word),
  };

  await notesStorage.savePage(nextPage);
  return toSourceMaterialRef(nextPage);
}
