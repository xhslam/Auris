/**
 * Wordbook Service Implementation
 *
 * Implements business logic for wordbook management.
 */

import type {
  IWordbookService,
  SavedWordRecord,
  ImportResult,
} from '@/services/interfaces/wordbook-service.interface';
import type { IWordbookRepository } from '@/services/interfaces/wordbook-repository.interface';
import {
  WordNotFoundError,
  WordbookServiceError,
  ValidationError,
} from '@/lib/errors/service-errors';

export class WordbookService implements IWordbookService {
  constructor(private repository: IWordbookRepository) {}

  async listAll(): Promise<SavedWordRecord[]> {
    try {
      return await this.repository.getAll();
    } catch (error) {
      throw new WordbookServiceError('Failed to list words', error as Error);
    }
  }

  async search(query: string): Promise<SavedWordRecord[]> {
    if (!query || query.trim().length === 0) {
      return this.listAll();
    }

    try {
      const words = await this.repository.getAll();
      const lowerQuery = query.toLowerCase();

      return words.filter(
        (word) =>
          word.word.toLowerCase().includes(lowerQuery) ||
          word.definitions.some((def) => def.toLowerCase().includes(lowerQuery)) ||
          word.synonyms.some((syn) => syn.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      throw new WordbookServiceError('Failed to search words', error as Error);
    }
  }

  async hasWord(word: string): Promise<boolean> {
    this.validateWord(word);

    try {
      return await this.repository.has(word);
    } catch (error) {
      throw new WordbookServiceError('Failed to check word existence', error as Error);
    }
  }

  async addWord(word: SavedWordRecord): Promise<void> {
    this.validateWordRecord(word);

    try {
      await this.repository.add(word);
    } catch (error) {
      throw new WordbookServiceError('Failed to add word', error as Error);
    }
  }

  async removeWord(word: string): Promise<void> {
    this.validateWord(word);

    try {
      const exists = await this.repository.has(word);
      if (!exists) {
        throw new WordNotFoundError(word);
      }

      await this.repository.remove(word);
    } catch (error) {
      if (error instanceof WordNotFoundError) {
        throw error;
      }
      throw new WordbookServiceError('Failed to remove word', error as Error);
    }
  }

  async importWords(words: SavedWordRecord[]): Promise<ImportResult> {
    if (!Array.isArray(words)) {
      throw new ValidationError('Words must be an array', 'words');
    }

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    for (const word of words) {
      try {
        this.validateWordRecord(word);

        const exists = await this.repository.has(word.word);
        if (exists) {
          result.skipped++;
          continue;
        }

        await this.repository.add(word);
        result.imported++;
      } catch (error) {
        result.errors.push(
          `Failed to import "${word.word}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return result;
  }

  async exportWords(): Promise<string> {
    try {
      const words = await this.repository.getAll();
      return JSON.stringify(words, null, 2);
    } catch (error) {
      throw new WordbookServiceError('Failed to export words', error as Error);
    }
  }

  // Validation methods

  private validateWord(word: string): void {
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      throw new ValidationError('Word is required', 'word');
    }
  }

  private validateWordRecord(word: SavedWordRecord): void {
    if (!word.word || word.word.trim().length === 0) {
      throw new ValidationError('Word text is required', 'word');
    }

    if (!Array.isArray(word.definitions) || word.definitions.length === 0) {
      throw new ValidationError('At least one definition is required', 'definitions');
    }

    if (word.definitions.some((def) => !def || def.trim().length === 0)) {
      throw new ValidationError('All definitions must be non-empty', 'definitions');
    }

    if (!word.lexicalCategory || word.lexicalCategory.trim().length === 0) {
      throw new ValidationError('Lexical category is required', 'lexicalCategory');
    }

    if (!Array.isArray(word.synonyms)) {
      throw new ValidationError('Synonyms must be an array', 'synonyms');
    }

    if (!word.sourceLabel || word.sourceLabel.trim().length === 0) {
      throw new ValidationError('Source label is required', 'sourceLabel');
    }

    if (!word.createdAt) {
      throw new ValidationError('Created at timestamp is required', 'createdAt');
    }
  }
}
