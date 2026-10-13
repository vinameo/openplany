import { describe, expect, it, vi } from 'vitest';
import { QueryFailedError, type DataSource } from 'typeorm';
import { runTransactionWithRetry } from './transactionRetry.js';

function makeQueryFailedError(code: string, constraint?: string): QueryFailedError {
  const err = new QueryFailedError('SELECT 1', [], new Error('db error'));
  (err as unknown as { driverError: unknown }).driverError = { code, constraint };
  return err;
}

describe('runTransactionWithRetry', () => {
  it('returns result when work succeeds on first attempt', async () => {
    const dataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => cb({} as never)),
    } as unknown as DataSource;

    const onRetry = vi.fn();
    const result = await runTransactionWithRetry(
      dataSource,
      async () => 'success',
      { maxAttempts: 3, onRetry },
    );

    expect(result).toBe('success');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries on deadlock (40P01) and succeeds on next attempt', async () => {
    let attempt = 0;
    const dataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => {
        attempt += 1;
        if (attempt === 1) {
          throw makeQueryFailedError('40P01');
        }
        return cb({} as never);
      }),
    } as unknown as DataSource;

    const onRetry = vi.fn();
    const result = await runTransactionWithRetry(
      dataSource,
      async () => 'recovered',
      { maxAttempts: 3, onRetry },
    );

    expect(result).toBe('recovered');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('retries on matching unique constraint error', async () => {
    let attempt = 0;
    const targetConstraint = 'uniq_target';
    const dataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => {
        attempt += 1;
        if (attempt === 1) {
          throw makeQueryFailedError('23505', targetConstraint);
        }
        return cb({} as never);
      }),
    } as unknown as DataSource;

    const onRetry = vi.fn();
    const result = await runTransactionWithRetry(
      dataSource,
      async () => 'ok',
      { maxAttempts: 3, retryOnUnique: targetConstraint, onRetry },
    );

    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('does not retry when unique constraint does not match retryOnUnique', async () => {
    const error = makeQueryFailedError('23505', 'other_constraint');
    const dataSource = {
      transaction: vi.fn().mockRejectedValue(error),
    } as unknown as DataSource;

    const onRetry = vi.fn();
    await expect(
      runTransactionWithRetry(
        dataSource,
        async () => 'ok',
        { maxAttempts: 3, retryOnUnique: 'expected_constraint', onRetry },
      ),
    ).rejects.toThrow(error);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('throws after reaching maxAttempts', async () => {
    const deadlockError = makeQueryFailedError('40P01');
    const dataSource = {
      transaction: vi.fn().mockRejectedValue(deadlockError),
    } as unknown as DataSource;

    const onRetry = vi.fn();
    await expect(
      runTransactionWithRetry(
        dataSource,
        async () => 'ok',
        { maxAttempts: 3, onRetry },
      ),
    ).rejects.toThrow(deadlockError);

    expect(onRetry).toHaveBeenCalledTimes(2); // Retried after attempt 1 and attempt 2, failed on attempt 3
  });
});
