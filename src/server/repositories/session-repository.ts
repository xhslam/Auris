import { randomUUID } from "crypto";
import type {
  SentenceRecord,
  SessionRecord,
  SessionSourceType,
  WordTokenRecord,
} from "@/features/sessions/session.types";
import { getOptionalSupabaseAdminClient } from "@/lib/supabase/admin-client";
import {
  readLocalSessionStore,
  writeLocalSessionStore,
} from "@/server/repositories/local-persistence";

type CreateEmptySessionInput = {
  userId: string;
  sourceType: SessionSourceType;
  title: string;
  originalText: string;
  normalizedText?: string;
};

type SavePreparedSessionArtifactsInput = {
  sessionId: string;
  status: SessionRecord["status"];
  audioUrl: string | null;
  durationMs: number | null;
  voiceId: string;
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
};

type SessionRepositoryBackend = {
  createEmptySessionRecord: (
    input: CreateEmptySessionInput,
  ) => Promise<SessionRecord>;
  deleteSessionRecord: (sessionId: string) => Promise<void>;
  savePreparedSessionArtifacts: (
    input: SavePreparedSessionArtifactsInput,
  ) => Promise<SessionRecord>;
  listRecentSessionsByUser: (userId: string) => Promise<SessionRecord[]>;
  getSessionById: (sessionId: string) => Promise<SessionRecord | null>;
  getSessionArtifacts: (
    sessionId: string,
  ) => Promise<{ sentences: SentenceRecord[]; wordTokens: WordTokenRecord[] }>;
};

type SessionRow = {
  id: string;
  user_id: string;
  source_type: SessionSourceType;
  title: string;
  original_text: string;
  normalized_text: string;
  status: SessionRecord["status"];
  voice_id: string;
  speed_default: number;
  audio_url: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

type SentenceRow = {
  id: string;
  session_id: string;
  order_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
};

type WordTokenRow = {
  id: string;
  sentence_id: string;
  order_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
};

let lastTimestampMs = 0;
let backendOverride: SessionRepositoryBackend | null = null;

function nextIsoTimestamp() {
  const nowMs = Date.now();
  lastTimestampMs = nowMs > lastTimestampMs ? nowMs : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    title: row.title,
    originalText: row.original_text,
    normalizedText: row.normalized_text,
    status: row.status,
    voiceId: row.voice_id,
    speedDefault: Number(row.speed_default),
    audioUrl: row.audio_url,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSentenceRow(row: SentenceRow): SentenceRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderIndex: row.order_index,
    text: row.text,
    startMs: row.start_ms,
    endMs: row.end_ms,
  };
}

function mapWordTokenRow(row: WordTokenRow): WordTokenRecord {
  return {
    id: row.id,
    sentenceId: row.sentence_id,
    orderIndex: row.order_index,
    text: row.text,
    startMs: row.start_ms,
    endMs: row.end_ms,
  };
}

const localFileBackend: SessionRepositoryBackend = {
  async createEmptySessionRecord(input) {
    const store = await readLocalSessionStore();
    const now = nextIsoTimestamp();
    const session: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      sourceType: input.sourceType,
      title: input.title,
      originalText: input.originalText,
      normalizedText: input.normalizedText ?? input.originalText,
      status: "draft",
      voiceId: "alloy",
      speedDefault: 1,
      audioUrl: null,
      durationMs: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeLocalSessionStore({
      ...store,
      sessions: [...store.sessions, session],
    });

    return session;
  },

  async deleteSessionRecord(sessionId) {
    const store = await readLocalSessionStore();
    const sentenceIds = new Set(
      store.sentences
        .filter((sentence) => sentence.sessionId === sessionId)
        .map((sentence) => sentence.id),
    );

    await writeLocalSessionStore({
      sessions: store.sessions.filter((session) => session.id !== sessionId),
      sentences: store.sentences.filter((sentence) => sentence.sessionId !== sessionId),
      wordTokens: store.wordTokens.filter(
        (wordToken) => !sentenceIds.has(wordToken.sentenceId),
      ),
    });
  },

  async savePreparedSessionArtifacts(input) {
    const store = await readLocalSessionStore();
    const session = store.sessions.find((item) => item.id === input.sessionId);
    const existingSentenceIds = new Set(
      store.sentences
        .filter((sentence) => sentence.sessionId === input.sessionId)
        .map((sentence) => sentence.id),
    );

    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const updatedSession: SessionRecord = {
      ...session,
      audioUrl: input.audioUrl,
      durationMs: input.durationMs,
      status: input.status,
      voiceId: input.voiceId,
      updatedAt: nextIsoTimestamp(),
    };

    await writeLocalSessionStore({
      sessions: store.sessions.map((item) =>
        item.id === updatedSession.id ? updatedSession : item,
      ),
      sentences: [
        ...store.sentences.filter((sentence) => sentence.sessionId !== input.sessionId),
        ...input.sentences,
      ],
      wordTokens: [
        ...store.wordTokens.filter(
          (token) => !existingSentenceIds.has(token.sentenceId),
        ),
        ...input.wordTokens,
      ],
    });

    return updatedSession;
  },

  async listRecentSessionsByUser(userId) {
    const store = await readLocalSessionStore();

    return store.sessions
      .filter((session) => session.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async getSessionById(sessionId) {
    const store = await readLocalSessionStore();
    return store.sessions.find((session) => session.id === sessionId) ?? null;
  },

  async getSessionArtifacts(sessionId) {
    const store = await readLocalSessionStore();
    const sentences = store.sentences
      .filter((sentence) => sentence.sessionId === sessionId)
      .sort((left, right) => left.orderIndex - right.orderIndex);
    const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
    const wordTokens = store.wordTokens
      .filter((token) => sentenceIds.has(token.sentenceId))
      .sort((left, right) => {
        const leftSentence = sentences.find((sentence) => sentence.id === left.sentenceId);
        const rightSentence = sentences.find((sentence) => sentence.id === right.sentenceId);

        if ((leftSentence?.orderIndex ?? 0) !== (rightSentence?.orderIndex ?? 0)) {
          return (leftSentence?.orderIndex ?? 0) - (rightSentence?.orderIndex ?? 0);
        }

        return left.orderIndex - right.orderIndex;
      });

    return {
      sentences,
      wordTokens,
    };
  },
};

const supabaseBackend: SessionRepositoryBackend = {
  async createEmptySessionRecord(input) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.createEmptySessionRecord(input);
    }

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        id: randomUUID(),
        user_id: input.userId,
        source_type: input.sourceType,
        title: input.title,
        original_text: input.originalText,
        normalized_text: input.normalizedText ?? input.originalText,
        status: "draft",
        voice_id: "alloy",
        speed_default: 1,
      })
      .select("*")
      .single();

    if (error || !data) {
      return localFileBackend.createEmptySessionRecord(input);
    }

    return mapSessionRow(data as SessionRow);
  },

  async deleteSessionRecord(sessionId) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.deleteSessionRecord(sessionId);
    }

    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);

    if (error) {
      return localFileBackend.deleteSessionRecord(sessionId);
    }
  },

  async savePreparedSessionArtifacts(input) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.savePreparedSessionArtifacts(input);
    }

    const { data: existingSession, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", input.sessionId)
      .single();

    if (sessionError || !existingSession) {
      return localFileBackend.savePreparedSessionArtifacts(input);
    }

    const { error: deleteError } = await supabase
      .from("sentences")
      .delete()
      .eq("session_id", input.sessionId);

    if (deleteError) {
      return localFileBackend.savePreparedSessionArtifacts(input);
    }

    if (input.sentences.length > 0) {
      const { error: insertSentencesError } = await supabase
        .from("sentences")
        .insert(
          input.sentences.map((sentence) => ({
            id: sentence.id,
            session_id: sentence.sessionId,
            order_index: sentence.orderIndex,
            text: sentence.text,
            start_ms: sentence.startMs,
            end_ms: sentence.endMs,
          })),
        );

      if (insertSentencesError) {
        return localFileBackend.savePreparedSessionArtifacts(input);
      }
    }

    if (input.wordTokens.length > 0) {
      const { error: insertWordTokensError } = await supabase
        .from("word_tokens")
        .insert(
          input.wordTokens.map((wordToken) => ({
            id: wordToken.id,
            sentence_id: wordToken.sentenceId,
            order_index: wordToken.orderIndex,
            text: wordToken.text,
            start_ms: wordToken.startMs,
            end_ms: wordToken.endMs,
          })),
        );

      if (insertWordTokensError) {
        return localFileBackend.savePreparedSessionArtifacts(input);
      }
    }

    const { data: updatedSession, error: updateError } = await supabase
      .from("sessions")
      .update({
        status: input.status,
        audio_url: input.audioUrl,
        duration_ms: input.durationMs,
        voice_id: input.voiceId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.sessionId)
      .select("*")
      .single();

    if (updateError || !updatedSession) {
      return localFileBackend.savePreparedSessionArtifacts(input);
    }

    return mapSessionRow(updatedSession as SessionRow);
  },

  async listRecentSessionsByUser(userId) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.listRecentSessionsByUser(userId);
    }

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      return localFileBackend.listRecentSessionsByUser(userId);
    }

    return (data as SessionRow[]).map(mapSessionRow);
  },

  async getSessionById(sessionId) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.getSessionById(sessionId);
    }

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      return localFileBackend.getSessionById(sessionId);
    }

    return data ? mapSessionRow(data as SessionRow) : null;
  },

  async getSessionArtifacts(sessionId) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localFileBackend.getSessionArtifacts(sessionId);
    }

    const { data: sentenceRows, error: sentenceError } = await supabase
      .from("sentences")
      .select("*")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true });

    if (sentenceError || !sentenceRows) {
      return localFileBackend.getSessionArtifacts(sessionId);
    }

    const sentenceRecords = (sentenceRows as SentenceRow[]).map(mapSentenceRow);
    const sentenceIdToOrder = new Map(
      sentenceRecords.map((sentence) => [sentence.id, sentence.orderIndex]),
    );

    if (sentenceRecords.length === 0) {
      return {
        sentences: [],
        wordTokens: [],
      };
    }

    const { data: wordTokenRows, error: wordTokenError } = await supabase
      .from("word_tokens")
      .select("*")
      .in(
        "sentence_id",
        sentenceRecords.map((sentence) => sentence.id),
      );

    if (wordTokenError || !wordTokenRows) {
      return localFileBackend.getSessionArtifacts(sessionId);
    }

    const wordTokens = (wordTokenRows as WordTokenRow[])
      .map(mapWordTokenRow)
      .sort((left, right) => {
        const sentenceOrderDiff =
          (sentenceIdToOrder.get(left.sentenceId) ?? 0) -
          (sentenceIdToOrder.get(right.sentenceId) ?? 0);

        if (sentenceOrderDiff !== 0) {
          return sentenceOrderDiff;
        }

        return left.orderIndex - right.orderIndex;
      });

    return {
      sentences: sentenceRecords,
      wordTokens,
    };
  },
};

function getActiveBackend() {
  return backendOverride ?? supabaseBackend;
}

export function __setSessionRepositoryBackendForTests(
  backend: SessionRepositoryBackend | null,
) {
  backendOverride = backend;
}

export async function createEmptySessionRecord(
  input: CreateEmptySessionInput,
): Promise<SessionRecord> {
  return getActiveBackend().createEmptySessionRecord(input);
}

export async function deleteSessionRecord(sessionId: string) {
  return getActiveBackend().deleteSessionRecord(sessionId);
}

export async function savePreparedSessionArtifacts(
  input: SavePreparedSessionArtifactsInput,
) {
  return getActiveBackend().savePreparedSessionArtifacts(input);
}

export async function listRecentSessionsByUser(userId: string) {
  return getActiveBackend().listRecentSessionsByUser(userId);
}

export async function getSessionById(sessionId: string) {
  return getActiveBackend().getSessionById(sessionId);
}

export async function getSessionArtifacts(sessionId: string) {
  return getActiveBackend().getSessionArtifacts(sessionId);
}
