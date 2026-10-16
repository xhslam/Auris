/**
 * SessionService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from '@/services/session-service';
import type { ISessionRepository } from '@/services/interfaces/session-repository.interface';
import type { SessionRecord } from '@/features/sessions/session.types';
import {
  SessionNotFoundError,
  ValidationError,
  SessionServiceError,
} from '@/lib/errors/service-errors';

describe('SessionService', () => {
  let service: SessionService;
  let mockRepository: ISessionRepository;

  const mockSession: SessionRecord = {
    id: 'session-123',
    userId: 'user-456',
    sourceType: 'paste',
    title: 'Test Session',
    originalText: 'Hello world',
    normalizedText: 'Hello world',
    status: 'draft',
    voiceId: 'alloy',
    speedDefault: 1,
    audioUrl: null,
    durationMs: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
  };

  beforeEach(() => {
    mockRepository = {
      getById: vi.fn(),
      getArtifacts: vi.fn(),
      listByUser: vi.fn(),
      create: vi.fn(),
      saveArtifacts: vi.fn(),
      delete: vi.fn(),
    };

    service = new SessionService(mockRepository);
  });

  describe('getById', () => {
    it('should return session when found', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(mockSession);

      const result = await service.getById('session-123');

      expect(result).toEqual(mockSession);
      expect(mockRepository.getById).toHaveBeenCalledWith('session-123');
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(null);

      await expect(service.getById('session-123')).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw ValidationError for empty session ID', async () => {
      await expect(service.getById('')).rejects.toThrow(ValidationError);
    });

    it('should wrap repository errors in SessionServiceError', async () => {
      vi.mocked(mockRepository.getById).mockRejectedValue(new Error('Database error'));

      await expect(service.getById('session-123')).rejects.toThrow(SessionServiceError);
    });
  });

  describe('getWithArtifacts', () => {
    it('should return session with artifacts', async () => {
      const mockArtifacts = {
        sentences: [],
        wordTokens: [],
      };

      vi.mocked(mockRepository.getById).mockResolvedValue(mockSession);
      vi.mocked(mockRepository.getArtifacts).mockResolvedValue(mockArtifacts);

      const result = await service.getWithArtifacts('session-123');

      expect(result).toEqual({
        session: mockSession,
        sentences: [],
        wordTokens: [],
      });
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(null);

      await expect(service.getWithArtifacts('session-123')).rejects.toThrow(
        SessionNotFoundError
      );
    });
  });

  describe('listRecent', () => {
    it('should return list of sessions', async () => {
      const mockSessions = [mockSession];
      vi.mocked(mockRepository.listByUser).mockResolvedValue(mockSessions);

      const result = await service.listRecent('user-456');

      expect(result).toEqual(mockSessions);
      expect(mockRepository.listByUser).toHaveBeenCalledWith('user-456');
    });

    it('should throw ValidationError for empty user ID', async () => {
      await expect(service.listRecent('')).rejects.toThrow(ValidationError);
    });
  });

  describe('create', () => {
    it('should create a new session', async () => {
      const input = {
        userId: 'user-456',
        sourceType: 'paste' as const,
        title: 'New Session',
        originalText: 'Test text',
      };

      vi.mocked(mockRepository.create).mockResolvedValue(mockSession);

      const result = await service.create(input);

      expect(result).toEqual(mockSession);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
    });

    it('should throw ValidationError for empty user ID', async () => {
      await expect(
        service.create({
          userId: '',
          sourceType: 'paste',
          title: 'Test',
          originalText: 'Test',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty title', async () => {
      await expect(
        service.create({
          userId: 'user-456',
          sourceType: 'paste',
          title: '',
          originalText: 'Test',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty original text', async () => {
      await expect(
        service.create({
          userId: 'user-456',
          sourceType: 'paste',
          title: 'Test',
          originalText: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for text too long', async () => {
      await expect(
        service.create({
          userId: 'user-456',
          sourceType: 'paste',
          title: 'Test',
          originalText: 'a'.repeat(50001),
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('saveArtifacts', () => {
    it('should save artifacts successfully', async () => {
      const input = {
        sessionId: 'session-123',
        status: 'ready' as const,
        audioUrl: 'https://example.com/audio.mp3',
        durationMs: 5000,
        voiceId: 'alloy',
        sentences: [],
        wordTokens: [],
      };

      vi.mocked(mockRepository.getById).mockResolvedValue(mockSession);
      vi.mocked(mockRepository.saveArtifacts).mockResolvedValue(mockSession);

      const result = await service.saveArtifacts(input);

      expect(result).toEqual(mockSession);
      expect(mockRepository.saveArtifacts).toHaveBeenCalledWith(input);
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(null);

      await expect(
        service.saveArtifacts({
          sessionId: 'session-123',
          status: 'ready',
          audioUrl: null,
          durationMs: null,
          voiceId: 'alloy',
          sentences: [],
          wordTokens: [],
        })
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw ValidationError for invalid input', async () => {
      await expect(
        service.saveArtifacts({
          sessionId: '',
          status: 'ready',
          audioUrl: null,
          durationMs: null,
          voiceId: 'alloy',
          sentences: [],
          wordTokens: [],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete session successfully', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(mockSession);
      vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

      await service.delete('session-123');

      expect(mockRepository.delete).toHaveBeenCalledWith('session-123');
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      vi.mocked(mockRepository.getById).mockResolvedValue(null);

      await expect(service.delete('session-123')).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw ValidationError for empty session ID', async () => {
      await expect(service.delete('')).rejects.toThrow(ValidationError);
    });
  });
});
