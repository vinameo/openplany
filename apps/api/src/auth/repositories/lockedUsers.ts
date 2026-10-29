import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type DataSource,
  type EntityManager,
  In,
  IsNull,
  MoreThan,
  Not,
} from 'typeorm';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import { equalsLowercase } from '../../database/findOperators.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import { Session } from '../entities/session.entity.js';
import { User } from '../entities/user.entity.js';
import { insertSessionRow, type NewSession } from './sessionsRepository.js';

export const MAX_LOCKED_WRITE_ATTEMPTS = 3;

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('users_email_lower_key violated');
    this.name = 'EmailAlreadyExistsError';
  }
}

/** Columns an admin or profile write may set on a user row. */
export type UserChanges = Partial<
  Pick<
    User,
    | 'firstName'
    | 'lastName'
    | 'displayName'
    | 'email'
    | 'isEmailVerified'
    | 'password'
    | 'isPasswordAutoset'
    | 'isPasswordExpired'
    | 'isPasswordResetRequired'
    | 'updatedAt'
  >
>;

export interface LockedUserWrites {
  /** Another user has this email, compared lower-case. */
  emailTakenByOther(email: string, userId: string): Promise<boolean>;
  /** Writes `changes`; throws EmailAlreadyExistsError on users_email_lower_key. */
  updateUser(userId: string, changes: UserChanges): Promise<void>;
  /** Revokes every live session of the user; returns how many. */
  revokeAllSessions(userId: string, at: Date): Promise<number>;
  /** Live session matching tokenHash and userId; null if not found or expired. */
  findLiveSession(
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<Session | null>;
  /** Inserts a new session via the shared session helper. */
  insertSession(record: NewSession): Promise<void>;
}

export abstract class LockedUsersRepository {
  /** Locks user rows in id ASC order, runs work in a transaction with 40P01/40001 retry. */
  abstract withLockedUsers<T>(
    ids: readonly string[],
    work: (locked: {
      rows: ReadonlyMap<string, User>;
      writes: LockedUserWrites;
    }) => Promise<T>,
    onRetry: (attempt: number) => void,
  ): Promise<T>;
}

export class TypeOrmLockedUserWrites implements LockedUserWrites {
  constructor(private readonly manager: EntityManager) {}

  async emailTakenByOther(email: string, userId: string): Promise<boolean> {
    return this.manager.exists(User, {
      where: { email: equalsLowercase(email.toLowerCase()), id: Not(userId) },
    });
  }

  async updateUser(userId: string, changes: UserChanges): Promise<void> {
    try {
      await this.manager.update(User, { id: userId }, changes);
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_key')) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }

  async revokeAllSessions(userId: string, at: Date): Promise<number> {
    const result = await this.manager.update(
      Session,
      { userId, revokedAt: IsNull() },
      { revokedAt: at },
    );
    return result.affected ?? 0;
  }

  async findLiveSession(
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<Session | null> {
    return this.manager.findOne(Session, {
      where: {
        userId,
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });
  }

  async insertSession(record: NewSession): Promise<void> {
    await insertSessionRow(this.manager, record);
  }
}

@Injectable()
export class TypeOrmLockedUsersRepository extends LockedUsersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  withLockedUsers<T>(
    ids: readonly string[],
    work: (locked: {
      rows: ReadonlyMap<string, User>;
      writes: LockedUserWrites;
    }) => Promise<T>,
    onRetry: (attempt: number) => void,
  ): Promise<T> {
    const uniqueIds = Array.from(new Set(ids));
    return runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        const rows = await manager.find(User, {
          where: { id: In(uniqueIds) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        const rowsMap = new Map<string, User>();
        for (const row of rows) {
          rowsMap.set(row.id, row);
        }
        return work({
          rows: rowsMap,
          writes: new TypeOrmLockedUserWrites(manager),
        });
      },
      {
        maxAttempts: MAX_LOCKED_WRITE_ATTEMPTS,
        onRetry,
      },
    );
  }
}
