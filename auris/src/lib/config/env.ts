/**
 * Environment Variable Validation
 *
 * Validates required environment variables at application startup.
 */

interface EnvConfig {
  // Supabase
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;

  // Application
  nodeEnv: string;
  appName: string;
  appVersion: string;
}

class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validate and return environment configuration
 */
export function validateEnv(): EnvConfig {
  const errors: string[] = [];

  // Required variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is required');
  }

  if (!supabaseAnonKey) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  // Optional but recommended for server-side operations
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey && nodeEnv === 'production') {
    console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is not set in production');
  }

  if (errors.length > 0) {
    throw new EnvValidationError(
      `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    supabaseServiceRoleKey,
    nodeEnv,
    appName: process.env.NEXT_PUBLIC_APP_NAME || 'Auris',
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  };
}

/**
 * Get validated environment configuration
 * Caches the result after first validation
 */
let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnv().nodeEnv === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnv().nodeEnv === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnv().nodeEnv === 'test';
}

/**
 * Sanitize sensitive data for logging
 */
export function sanitizeForLog(value: string): string {
  if (!value || value.length < 8) {
    return '***';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Log environment configuration (sanitized)
 */
export function logEnvConfig(): void {
  const env = getEnv();

  console.log('Environment Configuration:');
  console.log(`  Node Environment: ${env.nodeEnv}`);
  console.log(`  App Name: ${env.appName}`);
  console.log(`  App Version: ${env.appVersion}`);
  console.log(`  Supabase URL: ${env.supabaseUrl}`);
  console.log(`  Supabase Anon Key: ${sanitizeForLog(env.supabaseAnonKey)}`);

  if (env.supabaseServiceRoleKey) {
    console.log(`  Supabase Service Role Key: ${sanitizeForLog(env.supabaseServiceRoleKey)}`);
  }
}
