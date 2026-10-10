import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  LoginAttempt,
  type LoginReason,
  type LoginResult,
} from '../entities/loginAttempt.entity.js';

export interface NewLoginAttempt {
  userId: string | null;
  emailHash: string;
  ip: string;
  userAgent: string | null;
  result: LoginResult;
  reason: LoginReason | null;
}

/** The final outcome written onto a reserved attempt. */
export interface LoginAttemptOutcome {
  userId: string | null;
  result: 'failure' | 'success';
  reason: LoginReason | null;
}

export type FailureScope =
  { ip: string; emailHash?: undefined } | { ip: string; emailHash: string };

/** Reads and writes allowed while the per-IP attempt lock is held. */
export interface LockedLoginAttempts {
  /**
   * created_at of the n-th most recent failure (1-based) in scope since
   * `since`, or null when there are fewer than n.
   */
  nthRecentFailureAt(
    scope: FailureScope,
    since: Date,
    n: number,
  ): Promise<Date | null>;
  /** Failures for an email across all IPs since `since`. */
  countEmailFailures(emailHash: string, since: Date): Promise<number>;
  /** Inserts the attempt and returns its id. */
  insert(attempt: NewLoginAttempt): Promise<string>;
}

export abstract class LoginAttemptsRepository {
  /**
   * Runs `work` in one short transaction holding a lock per IP, so a
   * count-then-insert cannot interleave with a parallel sign-in from the
   * same IP. Never call slow code (password hashing) inside `work`.
   */
  abstract withIpLock<T>(
    ip: string,
    work: (attempts: LockedLoginAttempts) => Promise<T>,
  ): Promise<T>;

  /** Writes the outcome onto an attempt reserved by the rate limiter. */
  abstract finish(
    attemptId: string,
    outcome: LoginAttemptOutcome,
  ): Promise<void>;
}

class TypeOrmLockedLoginAttempts implements LockedLoginAttempts {
  constructor(private readonly manager: EntityManager) {}

  // `result = 'failure'` stays a literal so the partial indexes
  // idx_la_ip_failures / idx_la_email_ip_failures apply.
  async nthRecentFailureAt(
    scope: FailureScope,
    since: Date,
    n: number,
  ): Promise<Date | null> {
    const query = this.failures(since)
      .select('attempt.createdAt', 'createdAt')
      .andWhere('attempt.ip = :ip', { ip: scope.ip })
      .orderBy('attempt.createdAt', 'DESC')
      .offset(n - 1)
      .limit(1);
    if (scope.emailHash !== undefined) {
      query.andWhere('attempt.emailHash = :emailHash', {
        emailHash: scope.emailHash,
      });
    }
    const row = await query.getRawOne<{ createdAt: Date }>();
    return row?.createdAt ?? null;
  }

  countEmailFailures(emailHash: string, since: Date): Promise<number> {
    return this.failures(since)
      .andWhere('attempt.emailHash = :emailHash', { emailHash })
      .getCount();
  }

  async insert(attempt: NewLoginAttempt): Promise<string> {
    const result = await this.manager
      .getRepository(LoginAttempt)
      .insert({ ...attempt, medium: 'email' });
    const id: unknown = result.identifiers[0]?.id;
    if (typeof id !== 'string') {
      throw new Error('login_attempts insert returned no id');
    }
    return id;
  }

  private failures(since: Date) {
    return this.manager
      .getRepository(LoginAttempt)
      .createQueryBuilder('attempt')
      .where(`attempt.result = 'failure'`)
      .andWhere('attempt.createdAt > :since', { since });
  }
}

@Injectable()
export class TypeOrmLoginAttemptsRepository extends LoginAttemptsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  withIpLock<T>(
    ip: string,
    work: (attempts: LockedLoginAttempts) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // TypeORM has no advisory-lock API; the key is a bound parameter.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('login-attempts:' || $1, 0))`,
        [ip],
      );
      return work(new TypeOrmLockedLoginAttempts(manager));
    });
  }

  async finish(attemptId: string, outcome: LoginAttemptOutcome): Promise<void> {
    await this.dataSource
      .getRepository(LoginAttempt)
      .update({ id: attemptId }, outcome);
  }
}
