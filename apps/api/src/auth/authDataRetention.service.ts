import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, type Repository } from 'typeorm';
import { Clock } from './clock.js';
import { LoginAttempt } from './entities/loginAttempt.entity.js';
import { Session } from './entities/session.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// database-spec 8 (Vận hành → Dọn dữ liệu).
export const LOGIN_ATTEMPTS_RETENTION_DAYS = 90;
export const ENDED_SESSIONS_RETENTION_DAYS = 30;
export const RETENTION_BATCH_SIZE = 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;
const RUN_INTERVAL_MS = DAY_MS;

export interface RetentionResult {
  loginAttempts: number;
  sessions: number;
}

/**
 * Daily purge of login_attempts (IP, user agent: personal data) and ended
 * sessions. Deletes in batches so no single statement holds locks for long.
 * Safe to run on several replicas at once: every delete is idempotent.
 */
@Injectable()
export class AuthDataRetentionService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuthDataRetentionService.name);
  private firstRun: NodeJS.Timeout | undefined;
  private interval: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly loginAttempts: Repository<LoginAttempt>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    // unref(): the schedule never keeps the process (or a test run) alive.
    this.firstRun = setTimeout(() => {
      this.runScheduled();
      this.interval = setInterval(() => this.runScheduled(), RUN_INTERVAL_MS);
      this.interval.unref();
    }, FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.firstRun);
    clearInterval(this.interval);
  }

  async purge(): Promise<RetentionResult> {
    const now = this.clock.now().getTime();
    const attemptsCutoff = new Date(
      now - LOGIN_ATTEMPTS_RETENTION_DAYS * DAY_MS,
    );
    const sessionsCutoff = new Date(
      now - ENDED_SESSIONS_RETENTION_DAYS * DAY_MS,
    );

    const loginAttempts = await deleteInBatches(
      () =>
        this.loginAttempts.find({
          select: { id: true },
          where: { createdAt: LessThan(attemptsCutoff) },
          take: RETENTION_BATCH_SIZE,
        }),
      (ids) => this.loginAttempts.delete({ id: In(ids) }),
    );
    const sessions = await deleteInBatches(
      () =>
        this.sessions.find({
          select: { id: true },
          where: [
            { expiresAt: LessThan(sessionsCutoff) },
            { revokedAt: LessThan(sessionsCutoff) },
          ],
          take: RETENTION_BATCH_SIZE,
        }),
      (ids) => this.sessions.delete({ id: In(ids) }),
    );
    return { loginAttempts, sessions };
  }

  private runScheduled(): void {
    this.purge().then(
      (result) =>
        this.logger.log(
          `retention.purged loginAttempts=${result.loginAttempts} sessions=${result.sessions}`,
        ),
      (err: unknown) =>
        this.logger.error(
          `retention.failed error=${err instanceof Error ? err.message : String(err)}`,
        ),
    );
  }
}

async function deleteInBatches(
  nextBatch: () => Promise<{ id: string }[]>,
  remove: (ids: string[]) => Promise<unknown>,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const batch = await nextBatch();
    if (batch.length === 0) return deleted;
    await remove(batch.map((row) => row.id));
    deleted += batch.length;
    if (batch.length < RETENTION_BATCH_SIZE) return deleted;
  }
}
