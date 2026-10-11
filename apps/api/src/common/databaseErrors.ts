import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';

function driverErrorOf(
  error: unknown,
): { code?: unknown; constraint?: unknown } | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const driverError: unknown = error.driverError;
  return typeof driverError === 'object' && driverError !== null
    ? (driverError as { code?: unknown; constraint?: unknown })
    : undefined;
}

/** True when `error` is a Postgres unique violation on `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const driverError = driverErrorOf(error);
  return (
    driverError?.code === UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}

/** True when `error` is any Postgres foreign key violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  return driverErrorOf(error)?.code === FOREIGN_KEY_VIOLATION;
}

/** True when Postgres aborted the transaction to resolve a concurrency conflict; safe to retry. */
export function isTransactionConflict(error: unknown): boolean {
  const code = driverErrorOf(error)?.code;
  return code === DEADLOCK_DETECTED || code === SERIALIZATION_FAILURE;
}
