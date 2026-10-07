import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsNull, type DataSource } from 'typeorm';
import { LoginAttempt } from '../entities/loginAttempt.entity.js';
import { Session } from '../entities/session.entity.js';
import { User } from '../entities/user.entity.js';
import type { NewLoginAttempt } from './loginAttemptsRepository.js';

export interface SignInRecord {
  userId: string;
  at: Date;
  ip: string;
  userAgent: string | null;
  /** Replaces the stored hash when it used an outdated algorithm (R1). */
  rehashedPassword: string | null;
  session: {
    tokenHash: string;
    expiresAt: Date;
    isResetOnly: boolean;
  };
  attempt: NewLoginAttempt;
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
      await manager.update(User, record.userId, {
        lastLogin: record.at,
        lastLoginTime: record.at,
        lastActive: record.at,
        lastLoginIp: record.ip,
        lastLoginMedium: 'email',
        lastLoginUserAgent: record.userAgent,
        updatedAt: record.at,
        ...(record.rehashedPassword !== null && {
          password: record.rehashedPassword,
        }),
      });
      const session = manager.create(Session, {
        userId: record.userId,
        tokenHash: record.session.tokenHash,
        loginMedium: 'email',
        ip: record.ip,
        userAgent: record.userAgent,
        createdAt: record.at,
        lastUsedAt: record.at,
        expiresAt: record.session.expiresAt,
        isResetOnly: record.session.isResetOnly,
      });
      await manager.insert(Session, session);
      await manager.insert(LoginAttempt, {
        ...record.attempt,
        medium: 'email',
      });
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

  async touch(session: Session, now: Date, expiresAt: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Session, session.id, { lastUsedAt: now, expiresAt });
      // Throttled like the session itself: one users write per 5 minutes at most.
      await manager.update(User, session.userId, { lastActive: now });
    });
  }

  async revoke(tokenHash: string, ip: string, now: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(Session, {
        where: { tokenHash, revokedAt: IsNull() },
      });
      if (session === null) return;
      await manager.update(Session, session.id, { revokedAt: now });
      await manager.update(User, session.userId, {
        lastLogoutTime: now,
        lastLogoutIp: ip,
        updatedAt: now,
      });
    });
  }
}
