/**
 * Session Repository Interface
 *
 * Defines the contract for session data access.
 */

import type {
  SessionRecord,
  SentenceRecord,
  WordTokenRecord,
  SessionSourceType,
} from '@/features/sessions/session.types';

export interface CreateSessionData {
  userId: string;
  sourceType: SessionSourceType;
  title: string;
  originalText: string;
  normalizedText?: string;
}

export interface SaveArtifactsData {
  sessionId: string;
  status: SessionRecord['status'];
  audioUrl: string | null;
  durationMs: number | null;
  voiceId: string;
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
}

export interface SessionArtifacts {
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
}

/**
 * Session Repository Interface
 */
export interface ISessionRepository {
  /**
   * Get session by ID
   * @returns Session or null if not found
   */
  getById(id: string): Promise<SessionRecord | null>;

  /**
   * Get session artifacts (sentences and word tokens)
   */
  getArtifacts(sessionId: string): Promise<SessionArtifacts>;

  /**
   * List recent sessions for a user
   */
  listByUser(userId: string): Promise<SessionRecord[]>;

  /**
   * Create a new session
   */
  create(data: CreateSessionData): Promise<SessionRecord>;

  /**
   * Save session artifacts
   */
  saveArtifacts(data: SaveArtifactsData): Promise<SessionRecord>;

  /**
   * Delete a session
   */
  delete(id: string): Promise<void>;
}
