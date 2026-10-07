import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
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

export type FailureScope =
  { ip: string; emailHash?: undefined } | { ip: string; emailHash: string };

export abstract class LoginAttemptsRepository {
  abstract record(attempt: NewLoginAttempt): Promise<void>;

  /**
   * created_at of the n-th most recent failure (1-based) in scope since
   * `since`, or null when there are fewer than n.
   */
  abstract nthRecentFailureAt(
    scope: FailureScope,
    since: Date,
    n: number,
  ): Promise<Date | null>;

  /** Failures for an email across all IPs since `since`. */
  abstract countEmailFailures(emailHash: string, since: Date): Promise<number>;
}

interface CreatedAtRow {
  created_at: Date;
}
interface CountRow {
  count: number;
}

@Injectable()
export class TypeOrmLoginAttemptsRepository extends LoginAttemptsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async record(attempt: NewLoginAttempt): Promise<void> {
    await this.dataSource.getRepository(LoginAttempt).insert({
      ...attempt,
      medium: 'email',
    });
  }

  // `result = 'failure'` stays a literal so the partial indexes
  // idx_la_ip_failures / idx_la_email_ip_failures apply.
  async nthRecentFailureAt(
    scope: FailureScope,
    since: Date,
    n: number,
  ): Promise<Date | null> {
    const rows: CreatedAtRow[] =
      scope.emailHash === undefined
        ? await this.dataSource.query(
            `SELECT created_at FROM login_attempts
             WHERE ip = $1 AND result = 'failure' AND created_at > $2
             ORDER BY created_at DESC OFFSET $3 LIMIT 1`,
            [scope.ip, since, n - 1],
          )
        : await this.dataSource.query(
            `SELECT created_at FROM login_attempts
             WHERE email_hash = $1 AND ip = $2 AND result = 'failure' AND created_at > $3
             ORDER BY created_at DESC OFFSET $4 LIMIT 1`,
            [scope.emailHash, scope.ip, since, n - 1],
          );
    return rows[0]?.created_at ?? null;
  }

  async countEmailFailures(emailHash: string, since: Date): Promise<number> {
    const rows: CountRow[] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM login_attempts
       WHERE email_hash = $1 AND result = 'failure' AND created_at > $2`,
      [emailHash, since],
    );
    return rows[0]?.count ?? 0;
  }
}
