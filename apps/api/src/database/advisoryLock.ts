import type { EntityManager } from 'typeorm';

/**
 * Takes a Postgres transaction-scoped advisory lock on `namespace:key`; it is
 * released at commit/rollback. Must run inside a transaction.
 *
 * TypeORM has no advisory-lock API, so this is the one raw statement allowed
 * outside migrations. It names no table or column, and the key is bound.
 */
export async function acquireTransactionLock(
  manager: EntityManager,
  namespace: string,
  key: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${namespace}:${key}`,
  ]);
}
