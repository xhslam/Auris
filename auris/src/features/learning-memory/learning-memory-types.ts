import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";

export type LearningMemoryNoteRecord = {
  content: string;
  path: string;
  tags: string[];
  title: string;
};

export type LearningMemorySessionRecord = {
  id: string;
  title: string;
};

export type LearningMemoryRecallType = "note" | "sentence" | "session" | "word";

export type LearningMemoryRecallItem = {
  id: string;
  preview: string;
  reasons: string[];
  score: number;
  targetId?: string;
  targetPath?: string;
  title: string;
  type: LearningMemoryRecallType;
};

export type BuildRelatedMemoryInput = {
  materialText: string;
  notes: LearningMemoryNoteRecord[];
  sentences: SavedSentenceRecord[];
  sessions?: LearningMemorySessionRecord[];
  words: SavedWordRecord[];
};

export type LearningMemoryContext = {
  materialText: string;
  recallItems: LearningMemoryRecallItem[];
  sentences: SavedSentenceRecord[];
  sessionId?: string | null;
  sourceNotePath?: string | null;
  title: string;
  words: SavedWordRecord[];
};
