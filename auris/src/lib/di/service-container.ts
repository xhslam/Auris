/**
 * Service Container for Dependency Injection
 *
 * Manages service instances and their dependencies.
 * Supports lazy initialization and singleton pattern.
 */

type ServiceFactory<T> = () => T;

export class ServiceContainer {
  private factories = new Map<string, ServiceFactory<unknown>>();
  private instances = new Map<string, unknown>();

  /**
   * Register a service factory
   * @param key - Unique service identifier
   * @param factory - Function that creates the service instance
   */
  register<T>(key: string, factory: ServiceFactory<T>): void {
    if (this.factories.has(key)) {
      throw new Error(`Service already registered: ${key}`);
    }
    this.factories.set(key, factory);
  }

  /**
   * Resolve a service instance (lazy singleton)
   * @param key - Service identifier
   * @returns Service instance
   */
  resolve<T>(key: string): T {
    // Return cached instance if exists
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // Get factory
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`Service not found: ${key}`);
    }

    // Create and cache instance
    const instance = factory();
    this.instances.set(key, instance);
    return instance as T;
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.factories.has(key);
  }

  /**
   * Clear a specific service instance (for testing)
   */
  clear(key: string): void {
    this.instances.delete(key);
  }

  /**
   * Clear all service instances (for testing)
   */
  clearAll(): void {
    this.instances.clear();
  }

  /**
   * Get all registered service keys
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Global service container instance
 */
export const serviceContainer = new ServiceContainer();

/**
 * Service keys for type-safe access
 */
export const ServiceKeys = {
  SESSION_SERVICE: 'sessionService',
  WORDBOOK_SERVICE: 'wordbookService',
  SENTENCEBOOK_SERVICE: 'sentencebookService',
  SESSION_REPOSITORY: 'sessionRepository',
  WORDBOOK_REPOSITORY: 'wordbookRepository',
  SENTENCEBOOK_REPOSITORY: 'sentencebookRepository',
} as const;

export type ServiceKey = typeof ServiceKeys[keyof typeof ServiceKeys];
