/**
 * Session Service Interface
 *
 * Defines the contract for session business logic.
 */

import type {
  SessionRecord,
  SentenceRecord,
  WordTokenRecord,
  SessionSourceType,
} from '@/features/sessions/session.types';

export interface CreateSessionInput {
  userId: string;
  sourceType: SessionSourceType;
  title: string;
  originalText: string;
  normalizedText?: string;
}

export interface SaveArtifactsInput {
  sessionId: string;
  status: SessionRecord['status'];
  audioUrl: string | null;
  durationMs: number | null;
  voiceId: string;
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
}

export interface SessionPlayback {
  session: SessionRecord;
  sentences: SentenceRecord[];
  wordTokens: WordTokenRecord[];
}

/**
 * Session Service Interface
 */
export interface ISessionService {
  /**
   * Get session by ID
   * @throws SessionNotFoundError if session doesn't exist
   */
  getById(id: string): Promise<SessionRecord>;

  /**
   * Get session with all artifacts (sentences and word tokens)
   * @throws SessionNotFoundError if session doesn't exist
   */
  getWithArtifacts(id: string): Promise<SessionPlayback>;

  /**
   * List recent sessions for a user
   */
  listRecent(userId: string): Promise<SessionRecord[]>;

  /**
   * Create a new session
   * @throws ValidationError if input is invalid
   */
  create(input: CreateSessionInput): Promise<SessionRecord>;

  /**
   * Save session artifacts (sentences and word tokens)
   * @throws SessionNotFoundError if session doesn't exist
   * @throws ValidationError if input is invalid
   */
  saveArtifacts(input: SaveArtifactsInput): Promise<SessionRecord>;

  /**
   * Delete a session and all its artifacts
   * @throws SessionNotFoundError if session doesn't exist
   */
  delete(id: string): Promise<void>;
}
