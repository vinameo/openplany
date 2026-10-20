import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager, IsNull } from 'typeorm';
import { LoginAttempt } from '../entities/loginAttempt.entity.js';
import { Session } from '../entities/session.entity.js';
import { User } from '../entities/user.entity.js';
import type { LoginAttemptOutcome } from './loginAttemptsRepository.js';

export class StaleCredentialsError extends Error {
  constructor() {
    super('Credentials changed before session creation');
  }
}

export interface NewSession {
  userId: string;
  tokenHash: string;
  loginMedium: string;
  ip: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isResetOnly: boolean;
}

export async function insertSessionRow(
  manager: EntityManager,
  record: NewSession,
): Promise<Session> {
  const session = manager.create(Session, {
    userId: record.userId,
    tokenHash: record.tokenHash,
    loginMedium: record.loginMedium,
    ip: record.ip,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    isResetOnly: record.isResetOnly,
  });
  await manager.insert(Session, session);
  return session;
}

export interface SignInRecord {
  userId: string;
  verifiedHash: string;
  at: Date;
  ip: string;
  userAgent: string | null;
  /** Replaces the stored hash when it used an outdated algorithm (R1). */
  rehashedPassword: string | null;
  session: NewSession;
  /** The attempt the rate limiter reserved; marked successful in the same transaction. */
  attempt: { id: string; outcome: LoginAttemptOutcome };
}

export interface ActiveSession {
  session: Session;
  user: User;
}

export abstract class SessionsRepository {
  /** Writes users, sessions and login_attempts in one transaction (database-spec 5.3). */
  abstract createForSignIn(record: SignInRecord): Promise<Session>;

  /** A session that is not revoked and not expired at `now`, with its user. */
  abstract findActive(
    tokenHash: string,
    now: Date,
  ): Promise<ActiveSession | null>;

  /** Slides the session expiry and records users.last_active. */
  abstract touch(session: Session, now: Date, expiresAt: Date): Promise<void>;

  /** Revokes the session and records the logout on its user (database-spec 5.5). */
  abstract revoke(tokenHash: string, ip: string, now: Date): Promise<void>;
}

@Injectable()
export class TypeOrmSessionsRepository extends SessionsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  createForSignIn(record: SignInRecord): Promise<Session> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        User,
        { id: record.userId, password: record.verifiedHash },
        {
          lastLogin: record.at,
          lastLoginTime: record.at,
          lastActive: record.at,
          lastLoginIp: record.ip,
          lastLoginMedium: 'email',
          lastLoginUserAgent: record.userAgent,
          ...(record.rehashedPassword !== null && {
            password: record.rehashedPassword,
          }),
        },
      );
      if (result.affected === 0) {
        throw new StaleCredentialsError();
      }
      const session = await insertSessionRow(manager, record.session);
      await manager.update(
        LoginAttempt,
        { id: record.attempt.id },
        record.attempt.outcome,
      );
      return session;
    });
  }

  async findActive(
    tokenHash: string,
    now: Date,
  ): Promise<ActiveSession | null> {
    const session = await this.dataSource.getRepository(Session).findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    if (session === null || session.expiresAt <= now) return null;

    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: session.userId });
    return user === null ? null : { session, user };
  }

  // Lock order everywhere: users row first, then its sessions (as
  // createForSignIn and the admin password change do), so no two
  // transactions wait on each other in a cycle (40P01).

  async touch(session: Session, now: Date, expiresAt: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Throttled like the session itself: one users write per 5 minutes at most.
      await manager.update(User, session.userId, { lastActive: now });
      await manager.update(Session, session.id, { lastUsedAt: now, expiresAt });
    });
  }

  async revoke(tokenHash: string, ip: string, now: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Unlocked read: only to learn the user; the writes below lock in order.
      const session = await manager.findOne(Session, {
        where: { tokenHash, revokedAt: IsNull() },
      });
      if (session === null) return;
      await manager.update(User, session.userId, {
        lastLogoutTime: now,
        lastLogoutIp: ip,
      });
      await manager.update(
        Session,
        { id: session.id, revokedAt: IsNull() },
        { revokedAt: now },
      );
    });
  }
}
