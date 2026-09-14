/**
 * Session Service Implementation
 *
 * Implements business logic for session management.
 */

import type {
  ISessionService,
  CreateSessionInput,
  SaveArtifactsInput,
  SessionPlayback,
} from '@/services/interfaces/session-service.interface';
import type { ISessionRepository } from '@/services/interfaces/session-repository.interface';
import type { SessionRecord } from '@/features/sessions/session.types';
import {
  SessionNotFoundError,
  SessionServiceError,
  ValidationError,
} from '@/lib/errors/service-errors';

export class SessionService implements ISessionService {
  constructor(private repository: ISessionRepository) {}

  async getById(id: string): Promise<SessionRecord> {
    this.validateSessionId(id);

    try {
      const session = await this.repository.getById(id);

      if (!session) {
        throw new SessionNotFoundError(id);
      }

      return session;
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionServiceError('Failed to get session', error as Error);
    }
  }

  async getWithArtifacts(id: string): Promise<SessionPlayback> {
    this.validateSessionId(id);

    try {
      const [session, artifacts] = await Promise.all([
        this.repository.getById(id),
        this.repository.getArtifacts(id),
      ]);

      if (!session) {
        throw new SessionNotFoundError(id);
      }

      return {
        session,
        sentences: artifacts.sentences,
        wordTokens: artifacts.wordTokens,
      };
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionServiceError('Failed to get session with artifacts', error as Error);
    }
  }

  async listRecent(userId: string): Promise<SessionRecord[]> {
    this.validateUserId(userId);

    try {
      return await this.repository.listByUser(userId);
    } catch (error) {
      throw new SessionServiceError('Failed to list sessions', error as Error);
    }
  }

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    this.validateCreateInput(input);

    try {
      return await this.repository.create({
        userId: input.userId,
        sourceType: input.sourceType,
        title: input.title,
        originalText: input.originalText,
        normalizedText: input.normalizedText,
      });
    } catch (error) {
      throw new SessionServiceError('Failed to create session', error as Error);
    }
  }

  async saveArtifacts(input: SaveArtifactsInput): Promise<SessionRecord> {
    this.validateSaveArtifactsInput(input);

    try {
      // Verify session exists
      const session = await this.repository.getById(input.sessionId);
      if (!session) {
        throw new SessionNotFoundError(input.sessionId);
      }

      return await this.repository.saveArtifacts({
        sessionId: input.sessionId,
        status: input.status,
        audioUrl: input.audioUrl,
        durationMs: input.durationMs,
        voiceId: input.voiceId,
        sentences: input.sentences,
        wordTokens: input.wordTokens,
      });
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionServiceError('Failed to save session artifacts', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    this.validateSessionId(id);

    try {
      // Verify session exists
      const session = await this.repository.getById(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      await this.repository.delete(id);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionServiceError('Failed to delete session', error as Error);
    }
  }

  // Validation methods

  private validateSessionId(id: string): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new ValidationError('Session ID is required', 'id');
    }
  }

  private validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new ValidationError('User ID is required', 'userId');
    }
  }

  private validateCreateInput(input: CreateSessionInput): void {
    if (!input.userId || input.userId.trim().length === 0) {
      throw new ValidationError('User ID is required', 'userId');
    }

    if (!input.title || input.title.trim().length === 0) {
      throw new ValidationError('Title is required', 'title');
    }

    if (!input.originalText || input.originalText.trim().length === 0) {
      throw new ValidationError('Original text is required', 'originalText');
    }

    if (input.originalText.length > 50000) {
      throw new ValidationError('Original text is too long (max 50000 characters)', 'originalText');
    }

    if (!input.sourceType) {
      throw new ValidationError('Source type is required', 'sourceType');
    }
  }

  private validateSaveArtifactsInput(input: SaveArtifactsInput): void {
    if (!input.sessionId || input.sessionId.trim().length === 0) {
      throw new ValidationError('Session ID is required', 'sessionId');
    }

    if (!input.status) {
      throw new ValidationError('Status is required', 'status');
    }

    if (!input.voiceId || input.voiceId.trim().length === 0) {
      throw new ValidationError('Voice ID is required', 'voiceId');
    }

    if (!Array.isArray(input.sentences)) {
      throw new ValidationError('Sentences must be an array', 'sentences');
    }

    if (!Array.isArray(input.wordTokens)) {
      throw new ValidationError('Word tokens must be an array', 'wordTokens');
    }
  }
}
