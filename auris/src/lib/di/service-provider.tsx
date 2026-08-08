/**
 * React Context for Service Container
 *
 * Provides services to React components via Context API.
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { ServiceContainer, serviceContainer } from './service-container';

const ServiceContext = createContext<ServiceContainer | null>(null);

interface ServiceProviderProps {
  container?: ServiceContainer;
  children: ReactNode;
}

/**
 * Provider component for service container
 */
export function ServiceProvider({ container = serviceContainer, children }: ServiceProviderProps) {
  return <ServiceContext.Provider value={container}>{children}</ServiceContext.Provider>;
}

/**
 * Hook to access the service container
 */
export function useServiceContainer(): ServiceContainer {
  const container = useContext(ServiceContext);
  if (!container) {
    throw new Error('useServiceContainer must be used within ServiceProvider');
  }
  return container;
}

/**
 * Hook to resolve a specific service
 * @param key - Service identifier
 * @returns Service instance
 */
export function useService<T>(key: string): T {
  const container = useServiceContainer();
  return container.resolve<T>(key);
}
