import { randomUUID } from 'node:crypto';

/**
 * 32 random hex characters (UUID without hyphens).
 * Safe for database unique constraints and unpredictable (ADR-06).
 */
export function generateUsername(): string {
  return randomUUID().replaceAll('-', '');
}

