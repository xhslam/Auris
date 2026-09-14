"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildLearningAiContextPrompt } from "@/features/learning-memory/learning-ai-context";
import { buildLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";
import { buildLearningNoteMarkdown } from "@/features/learning-memory/learning-note-template";
import type {
  LearningMemoryNoteRecord,
  LearningMemoryRecallItem,
} from "@/features/learning-memory/learning-memory-types";
import { buildRelatedMemory } from "@/features/learning-memory/memory-recall-engine";
import { parseMarkdownNote } from "@/features/notes/markdown-codec";
import type { NotePage, NotePageSummary, NotesStorage } from "@/features/notes/note-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

type UseWorkspaceLearningMemoryInput = {
  desktopBridge?: DesktopBridge | null;
  notesStorage: NotesStorage | null;
  sentences: SavedSentenceRecord[];
  sessionId?: string | null;
  sourceNotePath?: string | null;
  sourceText: string;
  title: string;
  words: SavedWordRecord[];
};

function getFallbackTitle(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 60) || "Learning Note"
  );
}

function extractInlineTags(value: string) {
  return Array.from(value.matchAll(/(^|\s)#([A-Za-z0-9/_-]+)/g)).map(
    (match) => match[2],
  );
}

function extractFrontmatterTags(page: NotePage) {
  const tags = page.frontmatter?.tags;

  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.filter((tag): tag is string => typeof tag === "string");
}

function toNoteRecord(page: NotePage): LearningMemoryNoteRecord {
  return {
    content: page.markdownBody,
    path: page.relativePath,
    tags: Array.from(
      new Set([...extractFrontmatterTags(page), ...extractInlineTags(page.markdownBody)]),
    ),
    title: page.title,
  };
}

async function loadNotePages(notesStorage: NotesStorage | null) {
  if (!notesStorage) {
    return [];
  }

  const summaries = await notesStorage.listPages();
  const pages = await Promise.all(
    summaries.map((summary: NotePageSummary) => notesStorage.getPage(summary.id)),
  );

  return pages.filter((page): page is NotePage => page !== null);
}

function getMatchedWords(
  words: SavedWordRecord[],
  recallItems: LearningMemoryRecallItem[],
) {
  const recalledWords = new Set(
    recallItems
      .filter((item) => item.type === "word")
      .map((item) => item.targetId ?? item.title.toLowerCase()),
  );

  return words.filter((word) => recalledWords.has(word.word.toLowerCase()));
}

function getMatchedSentences(
  sentences: SavedSentenceRecord[],
  recallItems: LearningMemoryRecallItem[],
) {
  const recalledSentences = new Set(
    recallItems
      .filter((item) => item.type === "sentence")
      .map((item) => item.targetId)
      .filter((id): id is string => Boolean(id)),
  );

  return sentences.filter((sentence) => recalledSentences.has(sentence.id));
}

export function useWorkspaceLearningMemory({
  desktopBridge = null,
  notesStorage,
  sentences,
  sessionId = null,
  sourceNotePath = null,
  sourceText,
  title,
  words,
}: UseWorkspaceLearningMemoryInput) {
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [notePages, setNotePages] = useState<NotePage[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    try {
      setNotePages(await loadNotePages(notesStorage));
    } catch {
      setNotePages([]);
    }
  }, [notesStorage]);

  useEffect(() => {
    void refreshNotes();
  }, [refreshNotes]);

  const recallItems = useMemo(
    () =>
      buildRelatedMemory({
        materialText: sourceText,
        notes: notePages.map(toNoteRecord),
        sentences,
        words,
      }),
    [notePages, sentences, sourceText, words],
  );
  const noteTitle = title.trim() || getFallbackTitle(sourceText);
  const matchedWords = useMemo(
    () => getMatchedWords(words, recallItems),
    [recallItems, words],
  );
  const matchedSentences = useMemo(
    () => getMatchedSentences(sentences, recallItems),
    [recallItems, sentences],
  );

  const buildCurrentAiContextPrompt = useCallback(
    () =>
      buildLearningAiContextPrompt({
        materialText: sourceText,
        recallItems,
        sentences: matchedSentences,
        sessionId,
        sourceNotePath,
        title: noteTitle,
        words: matchedWords,
      }),
    [
      matchedSentences,
      matchedWords,
      noteTitle,
      recallItems,
      sessionId,
      sourceNotePath,
      sourceText,
    ],
  );

  const createLearningNote = useCallback(async () => {
    if (!notesStorage) {
      setStatusMessage("Choose a notes folder before creating a learning note.");
      return;
    }

    setIsCreatingNote(true);
    setStatusMessage(null);

    try {
      const createdPage = await notesStorage.createPage({
        title: noteTitle,
      });
      const createdAt = new Date().toISOString();
      const latestNotePages = await loadNotePages(notesStorage);
      const sourceNote = sourceNotePath
        ? latestNotePages.find((page) => page.relativePath === sourceNotePath)
        : undefined;
      const markdown = buildLearningNoteMarkdown({
        createdAt,
        dependencySnapshot: buildLearningDependencySnapshot({
          capturedAt: createdAt,
          materialText: sourceText,
          sourceNote: sourceNote
            ? { content: sourceNote.markdownBody, path: sourceNote.relativePath }
            : null,
        }),
        materialText: sourceText,
        recallItems,
        sentences: matchedSentences,
        sessionId,
        sourceNotePath,
        title: noteTitle,
        words: matchedWords,
      });
      const parsedPage = parseMarkdownNote({
        fileName: createdPage.fileName,
        markdown,
        relativePath: createdPage.relativePath,
      });

      await notesStorage.savePage({
        ...createdPage,
        frontmatter: parsedPage?.frontmatter,
        markdownBody: parsedPage?.markdownBody ?? markdown,
        title: parsedPage?.title ?? noteTitle,
      });
      await refreshNotes();
      setStatusMessage("Learning note saved to your vault.");
    } catch {
      setStatusMessage("Failed to create the learning note.");
    } finally {
      setIsCreatingNote(false);
    }
  }, [
    matchedSentences,
    matchedWords,
    noteTitle,
    notesStorage,
    recallItems,
    refreshNotes,
    sessionId,
    sourceNotePath,
    sourceText,
  ]);

  const copyAiContext = useCallback(async () => {
    const prompt = buildCurrentAiContextPrompt();

    try {
      await navigator.clipboard?.writeText(prompt);
      setStatusMessage("AI context copied.");
    } catch {
      setStatusMessage("Failed to copy AI context.");
    }
  }, [
    buildCurrentAiContextPrompt,
  ]);

  const sendAiContextToDock = useCallback(async () => {
    if (!desktopBridge?.aiPrompts) {
      await copyAiContext();
      setStatusMessage("AI Dock unavailable; AI context copied instead.");
      return;
    }

    try {
      await desktopBridge.aiPrompts.save({
        category: "Learning Memory",
        content: buildCurrentAiContextPrompt(),
        tags: ["learning-memory", "shadowing"],
        title: `Learning Memory: ${noteTitle}`,
        variables: [],
      });
      setStatusMessage("AI context saved to the AI Dock prompt library.");
    } catch {
      setStatusMessage("Failed to save AI context to the AI Dock.");
    }
  }, [buildCurrentAiContextPrompt, copyAiContext, desktopBridge, noteTitle]);

  return {
    copyAiContext,
    createLearningNote,
    isCreatingNote,
    recallItems,
    sendAiContextToDock,
    statusMessage,
  };
}
