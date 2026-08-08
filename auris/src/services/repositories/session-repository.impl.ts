/**
 * Session Repository Implementation
 *
 * Adapts the existing session-repository functions to the ISessionRepository interface.
 */

import type {
  ISessionRepository,
  CreateSessionData,
  SaveArtifactsData,
  SessionArtifacts,
} from '@/services/interfaces/session-repository.interface';
import type { SessionRecord } from '@/features/sessions/session.types';
import * as repo from '@/server/repositories/session-repository';

export class SessionRepository implements ISessionRepository {
  async getById(id: string): Promise<SessionRecord | null> {
    return repo.getSessionById(id);
  }

  async getArtifacts(sessionId: string): Promise<SessionArtifacts> {
    return repo.getSessionArtifacts(sessionId);
  }

  async listByUser(userId: string): Promise<SessionRecord[]> {
    return repo.listRecentSessionsByUser(userId);
  }

  async create(data: CreateSessionData): Promise<SessionRecord> {
    return repo.createEmptySessionRecord(data);
  }

  async saveArtifacts(data: SaveArtifactsData): Promise<SessionRecord> {
    return repo.savePreparedSessionArtifacts(data);
  }

  async delete(id: string): Promise<void> {
    return repo.deleteSessionRecord(id);
  }
}
