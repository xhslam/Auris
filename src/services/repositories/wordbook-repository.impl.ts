/**
 * Wordbook Repository Implementation
 *
 * Implements localStorage-based wordbook storage.
 */

import type { IWordbookRepository } from '@/services/interfaces/wordbook-repository.interface';
import type { SavedWordRecord } from '@/services/interfaces/wordbook-service.interface';

const WORDBOOK_STORAGE_KEY = 'english-shadowing-wordbook';

export class WordbookRepository implements IWordbookRepository {
  private readWords(): SavedWordRecord[] {
    if (typeof window === 'undefined') return [];

    try {
      const json = localStorage.getItem(WORDBOOK_STORAGE_KEY);
      if (!json) return [];

      const data = JSON.parse(json);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private writeWords(words: SavedWordRecord[]): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(WORDBOOK_STORAGE_KEY, JSON.stringify(words));
    } catch (error) {
      console.error('Failed to write wordbook:', error);
      throw error;
    }
  }

  async getAll(): Promise<SavedWordRecord[]> {
    return this.readWords();
  }

  async add(word: SavedWordRecord): Promise<void> {
    const words = this.readWords();
    const existing = words.filter(
      (item) => item.word.toLowerCase() !== word.word.toLowerCase()
    );
    const updated = [word, ...existing];
    this.writeWords(updated);
  }

  async remove(word: string): Promise<void> {
    const words = this.readWords();
    const updated = words.filter(
      (item) => item.word.toLowerCase() !== word.toLowerCase()
    );
    this.writeWords(updated);
  }

  async has(word: string): Promise<boolean> {
    const words = this.readWords();
    return words.some((item) => item.word.toLowerCase() === word.toLowerCase());
  }
}
