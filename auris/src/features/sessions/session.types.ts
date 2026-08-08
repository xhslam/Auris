export type SessionSourceType = "paste" | "file" | "url" | "template";
export type SessionStatus = "draft" | "preparing" | "ready" | "failed";

export type SessionRecord = {
  id: string;
  userId: string;
  sourceType: SessionSourceType;
  title: string;
  originalText: string;
  normalizedText: string;
  status: SessionStatus;
  voiceId: string;
  speedDefault: number;
  audioUrl: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SentenceRecord = {
  id: string;
  sessionId: string;
  orderIndex: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type WordTokenRecord = {
  id: string;
  sentenceId: string;
  orderIndex: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type TemplateRecord = {
  id: string;
  title: string;
  description: string;
  text: string;
  difficulty: "easy" | "medium" | "hard";
};

export type PlaybackSessionSummary = Pick<
  SessionRecord,
  "audioUrl" | "durationMs" | "id" | "speedDefault" | "status" | "title" | "voiceId"
>;

export type SessionPlayback = {
  session: PlaybackSessionSummary;
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
};
