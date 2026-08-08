/**
 * Custom Error Classes for Service Layer
 */

/**
 * Base service error class
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ServiceError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceError);
    }
  }
}

/**
 * Validation error
 */
export class ValidationError extends ServiceError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Session-specific errors
 */
export class SessionNotFoundError extends ServiceError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionServiceError extends ServiceError {
  constructor(message: string, cause?: Error) {
    super(message, 'SESSION_SERVICE_ERROR', cause);
    this.name = 'SessionServiceError';
  }
}

/**
 * Wordbook-specific errors
 */
export class WordNotFoundError extends ServiceError {
  constructor(word: string) {
    super(`Word not found: ${word}`, 'WORD_NOT_FOUND');
    this.name = 'WordNotFoundError';
  }
}

export class WordbookServiceError extends ServiceError {
  constructor(message: string, cause?: Error) {
    super(message, 'WORDBOOK_SERVICE_ERROR', cause);
    this.name = 'WordbookServiceError';
  }
}

/**
 * Sentencebook-specific errors
 */
export class SentenceNotFoundError extends ServiceError {
  constructor(sentenceId: string) {
    super(`Sentence not found: ${sentenceId}`, 'SENTENCE_NOT_FOUND');
    this.name = 'SentenceNotFoundError';
  }
}

export class SentencebookServiceError extends ServiceError {
  constructor(message: string, cause?: Error) {
    super(message, 'SENTENCEBOOK_SERVICE_ERROR', cause);
    this.name = 'SentencebookServiceError';
  }
}

/**
 * Type guard to check if error is a ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
