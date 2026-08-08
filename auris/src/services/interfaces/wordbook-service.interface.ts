/**
 * Wordbook Service Interface
 *
 * Defines the contract for wordbook business logic.
 */

export interface SavedWordRecord {
  word: string;
  definitions: string[];
  lexicalCategory: string;
  synonyms: string[];
  sourceLabel: string;
  createdAt: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Wordbook Service Interface
 */
export interface IWordbookService {
  /**
   * List all words
   */
  listAll(): Promise<SavedWordRecord[]>;

  /**
   * Search words by query
   */
  search(query: string): Promise<SavedWordRecord[]>;

  /**
   * Check if a word exists
   */
  hasWord(word: string): Promise<boolean>;

  /**
   * Add a new word
   * @throws ValidationError if word data is invalid
   */
  addWord(word: SavedWordRecord): Promise<void>;

  /**
   * Remove a word
   * @throws WordNotFoundError if word doesn't exist
   */
  removeWord(word: string): Promise<void>;

  /**
   * Import multiple words
   */
  importWords(words: SavedWordRecord[]): Promise<ImportResult>;

  /**
   * Export all words as JSON string
   */
  exportWords(): Promise<string>;
}
