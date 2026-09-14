/**
 * Service Registration
 *
 * Registers all services in the service container.
 */

import { serviceContainer, ServiceKeys } from '@/lib/di/service-container';
import { SessionService } from '@/services/session-service';
import { SessionRepository } from '@/services/repositories/session-repository.impl';
import { WordbookService } from '@/services/wordbook-service';
import { WordbookRepository } from '@/services/repositories/wordbook-repository.impl';
import type { ISessionRepository } from '@/services/interfaces/session-repository.interface';
import type { IWordbookRepository } from '@/services/interfaces/wordbook-repository.interface';

/**
 * Register all services
 * Call this once at application startup
 */
export function registerServices(): void {
  // Register repositories
  serviceContainer.register(
    ServiceKeys.SESSION_REPOSITORY,
    () => new SessionRepository()
  );

  serviceContainer.register(
    ServiceKeys.WORDBOOK_REPOSITORY,
    () => new WordbookRepository()
  );

  // Register services
  serviceContainer.register(ServiceKeys.SESSION_SERVICE, () => {
    const repository = serviceContainer.resolve<ISessionRepository>(
      ServiceKeys.SESSION_REPOSITORY
    );
    return new SessionService(repository);
  });

  serviceContainer.register(ServiceKeys.WORDBOOK_SERVICE, () => {
    const repository = serviceContainer.resolve<IWordbookRepository>(
      ServiceKeys.WORDBOOK_REPOSITORY
    );
    return new WordbookService(repository);
  });
}

/**
 * Check if services are registered
 */
export function areServicesRegistered(): boolean {
  return serviceContainer.has(ServiceKeys.SESSION_SERVICE);
}
