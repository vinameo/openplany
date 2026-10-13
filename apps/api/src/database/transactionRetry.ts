import type { DataSource, EntityManager } from 'typeorm';
import {
  isTransactionConflict,
  isUniqueViolation,
} from '../common/databaseErrors.js';

export interface RunTransactionWithRetryOptions {
  maxAttempts: number;
  retryOnUnique?: string;
  onRetry: (attempt: number) => void;
}

/**
 * Runs a transactional block of work against the data source.
 * Automatically retries if a transaction conflict occurs or if a unique violation
 * matching `opts.retryOnUnique` occurs, up to `opts.maxAttempts`.
 */
export async function runTransactionWithRetry<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  opts: RunTransactionWithRetryOptions,
): Promise<T> {
  const { maxAttempts, retryOnUnique, onRetry } = opts;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await dataSource.transaction(work);
    } catch (err: unknown) {
      const retryable =
        isTransactionConflict(err) ||
        (retryOnUnique !== undefined && isUniqueViolation(err, retryOnUnique));

      if (retryable && attempt < maxAttempts) {
        onRetry(attempt);
        continue;
      }
      throw err;
    }
  }
}
