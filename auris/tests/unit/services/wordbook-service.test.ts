/**
 * WordbookService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WordbookService } from '@/services/wordbook-service';
import type { IWordbookRepository } from '@/services/interfaces/wordbook-repository.interface';
import type { SavedWordRecord } from '@/services/interfaces/wordbook-service.interface';
import {
  WordNotFoundError,
  ValidationError,
  WordbookServiceError,
} from '@/lib/errors/service-errors';

describe('WordbookService', () => {
  let service: WordbookService;
  let mockRepository: IWordbookRepository;

  const mockWord: SavedWordRecord = {
    word: 'example',
    definitions: ['a sample or illustration'],
    lexicalCategory: 'noun',
    synonyms: ['sample', 'instance'],
    sourceLabel: 'manual',
    createdAt: '2026-04-21T00:00:00.000Z',
  };

  beforeEach(() => {
    mockRepository = {
      getAll: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    };

    service = new WordbookService(mockRepository);
  });

  describe('listAll', () => {
    it('should return all words', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.listAll();

      expect(result).toEqual(mockWords);
      expect(mockRepository.getAll).toHaveBeenCalled();
    });

    it('should wrap repository errors', async () => {
      vi.mocked(mockRepository.getAll).mockRejectedValue(new Error('Storage error'));

      await expect(service.listAll()).rejects.toThrow(WordbookServiceError);
    });
  });

  describe('search', () => {
    it('should search words by query', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.search('example');

      expect(result).toEqual(mockWords);
    });

    it('should return all words for empty query', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.search('');

      expect(result).toEqual(mockWords);
    });

    it('should search in definitions', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.search('sample');

      expect(result).toEqual(mockWords);
    });

    it('should search in synonyms', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.search('instance');

      expect(result).toEqual(mockWords);
    });

    it('should be case insensitive', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.search('EXAMPLE');

      expect(result).toEqual(mockWords);
    });
  });

  describe('hasWord', () => {
    it('should return true when word exists', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(true);

      const result = await service.hasWord('example');

      expect(result).toBe(true);
      expect(mockRepository.has).toHaveBeenCalledWith('example');
    });

    it('should return false when word does not exist', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(false);

      const result = await service.hasWord('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw ValidationError for empty word', async () => {
      await expect(service.hasWord('')).rejects.toThrow(ValidationError);
    });
  });

  describe('addWord', () => {
    it('should add word successfully', async () => {
      vi.mocked(mockRepository.add).mockResolvedValue(undefined);

      await service.addWord(mockWord);

      expect(mockRepository.add).toHaveBeenCalledWith(mockWord);
    });

    it('should throw ValidationError for empty word text', async () => {
      await expect(
        service.addWord({
          ...mockWord,
          word: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty definitions', async () => {
      await expect(
        service.addWord({
          ...mockWord,
          definitions: [],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty definition item', async () => {
      await expect(
        service.addWord({
          ...mockWord,
          definitions: [''],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty lexical category', async () => {
      await expect(
        service.addWord({
          ...mockWord,
          lexicalCategory: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid synonyms', async () => {
      await expect(
        service.addWord({
          ...mockWord,
          synonyms: 'not-an-array' as unknown as SavedWordRecord['synonyms'],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('removeWord', () => {
    it('should remove word successfully', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(true);
      vi.mocked(mockRepository.remove).mockResolvedValue(undefined);

      await service.removeWord('example');

      expect(mockRepository.remove).toHaveBeenCalledWith('example');
    });

    it('should throw WordNotFoundError when word does not exist', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(false);

      await expect(service.removeWord('nonexistent')).rejects.toThrow(WordNotFoundError);
    });

    it('should throw ValidationError for empty word', async () => {
      await expect(service.removeWord('')).rejects.toThrow(ValidationError);
    });
  });

  describe('importWords', () => {
    it('should import new words successfully', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(false);
      vi.mocked(mockRepository.add).mockResolvedValue(undefined);

      const result = await service.importWords([mockWord]);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip existing words', async () => {
      vi.mocked(mockRepository.has).mockResolvedValue(true);

      const result = await service.importWords([mockWord]);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors for invalid words', async () => {
      const invalidWord = { ...mockWord, word: '' };

      const result = await service.importWords([invalidWord]);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should throw ValidationError for non-array input', async () => {
      await expect(service.importWords('not-an-array' as unknown as SavedWordRecord[])).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('exportWords', () => {
    it('should export words as JSON string', async () => {
      const mockWords = [mockWord];
      vi.mocked(mockRepository.getAll).mockResolvedValue(mockWords);

      const result = await service.exportWords();

      expect(result).toBe(JSON.stringify(mockWords, null, 2));
    });

    it('should wrap repository errors', async () => {
      vi.mocked(mockRepository.getAll).mockRejectedValue(new Error('Storage error'));

      await expect(service.exportWords()).rejects.toThrow(WordbookServiceError);
    });
  });
});
