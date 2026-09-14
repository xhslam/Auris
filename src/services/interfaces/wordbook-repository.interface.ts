/**
 * Wordbook Repository Interface
 *
 * Defines the contract for wordbook data access.
 */

import type { SavedWordRecord } from '@/services/interfaces/wordbook-service.interface';

/**
 * Wordbook Repository Interface
 */
export interface IWordbookRepository {
  /**
   * Get all words
   */
  getAll(): Promise<SavedWordRecord[]>;

  /**
   * Add a word
   */
  add(word: SavedWordRecord): Promise<void>;

  /**
   * Remove a word
   */
  remove(word: string): Promise<void>;

  /**
   * Check if a word exists
   */
  has(word: string): Promise<boolean>;
}
