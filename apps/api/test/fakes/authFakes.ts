import type { LoginAttempt } from '../../src/auth/entities/loginAttempt.entity.js';
import { Session } from '../../src/auth/entities/session.entity.js';
import { User } from '../../src/auth/entities/user.entity.js';
import { Clock } from '../../src/auth/clock.js';
import {
  PasswordHasher,
  type PasswordVerification,
} from '../../src/auth/passwordHasher.js';
import {
  LoginRateLimiter,
  type PendingLoginAttempt,
  type RateLimitDecision,
} from '../../src/auth/rateLimiter.js';
import {
  LoginAttemptsRepository,
  type FailureScope,
  type LockedLoginAttempts,
  type LoginAttemptOutcome,
  type NewLoginAttempt,
} from '../../src/auth/repositories/loginAttemptsRepository.js';
import {
  SessionsRepository,
  type ActiveSession,
  type SignInRecord,
} from '../../src/auth/repositories/sessionsRepository.js';
import {
  type ProfileChanges,
  UsersRepository,
} from '../../src/auth/repositories/usersRepository.js';

export const NOW = new Date('2026-10-07T12:00:00.000Z');

export function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    password: 'hash:Secret123!',
    username: 'an',
    email: 'an@openplany.dev',
    firstName: 'An',
    lastName: 'Nguyen',
    displayName: 'An Nguyen',
    avatar: null,
    timezone: 'Asia/Ho_Chi_Minh',
    updatedAt: NOW,
    lastLogin: null,
    lastLoginTime: null,
    lastLogoutTime: null,
    lastActive: null,
    lastLoginIp: null,
    lastLogoutIp: null,
    lastLoginMedium: null,
    lastLoginUserAgent: null,
    isActive: true,
    isBot: false,
    maskedAt: null,
    isManaged: false,
    isPasswordAutoset: false,
    isPasswordExpired: false,
    isPasswordResetRequired: false,
    isEmailVerified: true,
    isSuperuser: false,
    ...overrides,
  });
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return Object.assign(new Session(), {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'token-hash',
    loginMedium: 'email',
    ip: '203.0.113.7',
    userAgent: 'vitest',
    createdAt: NOW,
    lastUsedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    isResetOnly: false,
    ...overrides,
  });
}

export class FakeClock extends Clock {
  current: Date;
  readonly sleeps: number[] = [];

  constructor(initial: Date = NOW) {
    super();
    this.current = initial;
  }

  now(): Date {
    return this.current;
  }

  sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    return Promise.resolve();
  }
}

/** "Hashes" are `hash:<password>`; anything else never verifies. */
export class FakePasswordHasher extends PasswordHasher {
  readonly verified: string[] = [];
  needsRehash = false;

  hash(password: string): Promise<string> {
    return Promise.resolve(`hash:${password}`);
  }

  verify(storedHash: string, password: string): Promise<PasswordVerification> {
    this.verified.push(storedHash);
    const ok = storedHash === `hash:${password}`;
    return Promise.resolve({ ok, needsRehash: ok && this.needsRehash });
  }
}

export const RESERVED_ATTEMPT_ID = 'attempt-1';

export class FakeRateLimiter extends LoginRateLimiter {
  decision:
    | { blocked: true; retryAfterSeconds: number }
    | { blocked: false; delayMs: number } = { blocked: false, delayMs: 0 };
  readonly reservations: PendingLoginAttempt[] = [];

  reserve(attempt: PendingLoginAttempt): Promise<RateLimitDecision> {
    this.reservations.push(attempt);
    return Promise.resolve(
      this.decision.blocked
        ? this.decision
        : { ...this.decision, attemptId: RESERVED_ATTEMPT_ID },
    );
  }
}

export class FakeUsersRepository extends UsersRepository {
  readonly users: User[] = [];
  lookups = 0;

  findByEmail(email: string): Promise<User | null> {
    this.lookups += 1;
    return Promise.resolve(
      this.users.find((user) => user.email?.toLowerCase() === email) ?? null,
    );
  }

  findActiveById(id: string): Promise<User | null> {
    return Promise.resolve(
      this.users.find(
        (user) => user.id === id && user.isActive && user.maskedAt === null,
      ) ?? null,
    );
  }

  readonly profileUpdates: { id: string; changes: ProfileChanges; at: Date }[] =
    [];
  /** Simulates an account locked between the session check and the write. */
  rejectProfileUpdates = false;

  async updateProfile(
    id: string,
    changes: ProfileChanges,
    at: Date,
  ): Promise<User | null> {
    this.profileUpdates.push({ id, changes, at });
    const user = await this.findActiveById(id);
    if (user === null || this.rejectProfileUpdates) return null;
    Object.assign(user, changes, { updatedAt: at });
    return user;
  }
}

export class FakeLoginAttemptsRepository extends LoginAttemptsRepository {
  /** Rows inserted while the IP lock was held (provisional and blocked). */
  readonly inserted: (NewLoginAttempt & { id: string })[] = [];
  /** Outcomes written by finish(), in order. */
  readonly recorded: (LoginAttemptOutcome & { id: string })[] = [];
  /** Failure rows the rate limiter reads: newest last. */
  readonly failures: Pick<LoginAttempt, 'emailHash' | 'ip' | 'createdAt'>[] =
    [];
  readonly lockedIps: string[] = [];

  private readonly locked: LockedLoginAttempts = {
    nthRecentFailureAt: (scope: FailureScope, since: Date, n: number) => {
      const matching = this.failures
        .filter(
          (row) =>
            row.ip === scope.ip &&
            (scope.emailHash === undefined ||
              row.emailHash === scope.emailHash) &&
            row.createdAt > since,
        )
        .map((row) => row.createdAt)
        .sort((a, b) => b.getTime() - a.getTime());
      return Promise.resolve(matching[n - 1] ?? null);
    },
    countEmailFailures: (emailHash: string, since: Date) =>
      Promise.resolve(
        this.failures.filter(
          (row) => row.emailHash === emailHash && row.createdAt > since,
        ).length,
      ),
    insert: (attempt: NewLoginAttempt) => {
      const id = `attempt-${this.inserted.length + 1}`;
      this.inserted.push({ ...attempt, id });
      if (attempt.result === 'failure') {
        this.failures.push({
          emailHash: attempt.emailHash,
          ip: attempt.ip,
          createdAt: NOW,
        });
      }
      return Promise.resolve(id);
    },
  };

  withIpLock<T>(
    ip: string,
    work: (attempts: LockedLoginAttempts) => Promise<T>,
  ): Promise<T> {
    this.lockedIps.push(ip);
    return work(this.locked);
  }

  finish(attemptId: string, outcome: LoginAttemptOutcome): Promise<void> {
    this.recorded.push({ ...outcome, id: attemptId });
    return Promise.resolve();
  }
}

export class FakeSessionsRepository extends SessionsRepository {
  readonly signIns: SignInRecord[] = [];
  readonly touches: { session: Session; now: Date; expiresAt: Date }[] = [];
  readonly revocations: { tokenHash: string; ip: string; now: Date }[] = [];
  active: ActiveSession | null = null;

  createForSignIn(record: SignInRecord): Promise<Session> {
    this.signIns.push(record);
    return Promise.resolve(
      makeSession({ tokenHash: record.session.tokenHash }),
    );
  }

  findActive(): Promise<ActiveSession | null> {
    return Promise.resolve(this.active);
  }

  touch(session: Session, now: Date, expiresAt: Date): Promise<void> {
    this.touches.push({ session, now, expiresAt });
    return Promise.resolve();
  }

  revoke(tokenHash: string, ip: string, now: Date): Promise<void> {
    this.revocations.push({ tokenHash, ip, now });
    return Promise.resolve();
  }
}
