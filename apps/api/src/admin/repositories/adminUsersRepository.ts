import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  type EntityManager,
  type FindOptionsWhere,
  In,
  IsNull,
  Not,
  type Repository,
} from 'typeorm';
import { Session } from '../../auth/entities/session.entity.js';
import { User } from '../../auth/entities/user.entity.js';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import {
  containsIgnoringCaseAndAccentsSql,
  equalsLowercase,
} from '../../database/findOperators.js';
import { matchesWhere } from '../../database/matchesWhere.js';
import { addOrderByEmptyAndNullLast } from '../../database/sortHelpers.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';

import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserListQuery,
  adminUserSearchTerms,
  defaultAdminUserOrder,
} from '@repo/contracts';

/**
 * INV-02: Single source of truth for "who appears in the Users page":
 * not a bot and not anonymized/masked. Used in SQL (list, detail) and on
 * locked rows (`isListedUser`) — never restated.
 */
export const LISTED_USER: FindOptionsWhere<User> = {
  isBot: false,
  maskedAt: IsNull(),
};

/** RQ INV-11: who may write on the Users page, decided on the locked row. */
export const ACTIVE_INSTANCE_ADMIN: FindOptionsWhere<User> = {
  isSuperuser: true,
  isActive: true,
  maskedAt: IsNull(),
};

export const isListedUser = (user: User): boolean =>
  matchesWhere(user, LISTED_USER);

export const isActiveInstanceAdmin = (user: User): boolean =>
  matchesWhere(user, ACTIVE_INSTANCE_ADMIN);

/** Attempts for one locked write before a 40P01/40001 reaches the client. */
const MAX_LOCKED_WRITE_ATTEMPTS = 3;

export interface NewUser {
  email: string;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  displayName: string;
  createdById: string;
  at: Date;
}

export interface CreatedUserRow {
  id: string;
  createdAt: Date;
}

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('users_email_lower_key violated');
    this.name = 'EmailAlreadyExistsError';
  }
}

/** Columns an admin write may set on a user row. */
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

/** Writes allowed while `withLockedActorAndTarget` holds both rows. */
export interface LockedUserWrites {
  /** Another user (listed or not: bots and masked users hold emails too) has this email, compared lower-case. */
  emailTakenByOther(email: string, userId: string): Promise<boolean>;
  /** Writes `changes`; throws EmailAlreadyExistsError on users_email_lower_key. */
  updateUser(userId: string, changes: UserChanges): Promise<void>;
  /** Revokes every live session of the user; returns how many. */
  revokeAllSessions(userId: string, at: Date): Promise<number>;
}

export interface LockedActorAndTarget {
  /** The rows locked FOR UPDATE, or null when absent. Actor = target → the same row. */
  actor: User | null;
  target: User | null;
  writes: LockedUserWrites;
}

export abstract class AdminUsersRepository {
  /** Inserts one user with every privilege flag forced to false (INV-02). */
  abstract createUser(user: NewUser): Promise<CreatedUserRow>;
  /** Queries listed users with pagination and ordering (INV-02, INV-03). */
  abstract list(
    query: AdminUserListQuery,
  ): Promise<{ items: User[]; total: number }>;
  /** Finds one listed user by id (DB B4). */
  abstract findById(id: string): Promise<User | null>;
  /**
   * Runs `work` in one transaction holding actor and target locked in id
   * order (DB B5 step 1, BA ADR-02), so every admin write on a user (edit,
   * password, and FC-01/FC-02 later) shares one lock order. Retried on
   * deadlock or serialization failure; `work` must only write through
   * `writes`, so a retry repeats nothing outside the transaction.
   */
  abstract withLockedActorAndTarget<T>(
    actorId: string,
    targetId: string,
    work: (locked: LockedActorAndTarget) => Promise<T>,
  ): Promise<T>;
}

class TypeOrmLockedUserWrites implements LockedUserWrites {
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
    // The users row is already locked: same order as sign-in, touch and
    // logout (users → sessions), so this cannot deadlock with them.
    const result = await this.manager.update(
      Session,
      { userId, revokedAt: IsNull() },
      { revokedAt: at },
    );
    return result.affected ?? 0;
  }
}

@Injectable()
export class TypeOrmAdminUsersRepository extends AdminUsersRepository {
  private readonly logger = new Logger(TypeOrmAdminUsersRepository.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { ...LISTED_USER, id } });
  }

  withLockedActorAndTarget<T>(
    actorId: string,
    targetId: string,
    work: (locked: LockedActorAndTarget) => Promise<T>,
  ): Promise<T> {
    return runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // Not filtered by LISTED_USER: the caller decides on the locked rows.
        const rows = await manager.find(User, {
          where: { id: In([actorId, targetId]) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        return work({
          actor: rows.find((row) => row.id === actorId) ?? null,
          target: rows.find((row) => row.id === targetId) ?? null,
          writes: new TypeOrmLockedUserWrites(manager),
        });
      },
      {
        maxAttempts: MAX_LOCKED_WRITE_ATTEMPTS,
        onRetry: (attempt) => {
          this.logger.warn(
            `admin.users.lock.retry actorId=${actorId} userId=${targetId} attempt=${attempt}`,
          );
        },
      },
    );
  }

  async list(
    query: AdminUserListQuery,
  ): Promise<{ items: User[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * ADMIN_USERS_PAGE_SIZE;
    const take = ADMIN_USERS_PAGE_SIZE;
    const sort = query.sort ?? 'createdAt';
    const orderDirection =
      (query.order ?? defaultAdminUserOrder(sort)) === 'asc' ? 'ASC' : 'DESC';

    const qb = this.users
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.email',
        'u.firstName',
        'u.lastName',
        'u.displayName',
        'u.avatar',
        'u.isActive',
        'u.isSuperuser',
        'u.createdAt',
        'u.updatedAt',
      ])
      .where(LISTED_USER);

    if (query.status === 'active') {
      qb.andWhere({ isActive: true });
    } else if (query.status === 'deactivated') {
      qb.andWhere({ isActive: false });
    }

    if (query.instanceAdmin === 'only') {
      qb.andWhere({ isSuperuser: true });
    }

    // One OR group per word across the four fields; groups joined by AND.
    adminUserSearchTerms(query.search).forEach((term, index) => {
      const paramName = `search_term_${index}`;
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where(containsIgnoringCaseAndAccentsSql('u.firstName', paramName))
            .orWhere(containsIgnoringCaseAndAccentsSql('u.lastName', paramName))
            .orWhere(containsIgnoringCaseAndAccentsSql('u.displayName', paramName))
            .orWhere(containsIgnoringCaseAndAccentsSql('u.email', paramName));
        }),
        { [paramName]: term },
      );
    });

    // Sort order with empty and NULL last (DB B3)
    if (sort === 'fullName') {
      addOrderByEmptyAndNullLast(qb, 'u.firstName', orderDirection, true);
      addOrderByEmptyAndNullLast(qb, 'u.lastName', orderDirection, false);
      qb.addOrderBy('u.id', orderDirection);
    } else if (sort === 'displayName') {
      addOrderByEmptyAndNullLast(qb, 'u.displayName', orderDirection, true);
      qb.addOrderBy('u.id', orderDirection);
    } else if (sort === 'email') {
      addOrderByEmptyAndNullLast(qb, 'u.email', orderDirection, true);
      qb.addOrderBy('u.id', orderDirection);
    } else {
      // createdAt
      qb.orderBy('u.createdAt', orderDirection);
      qb.addOrderBy('u.id', orderDirection);
    }

    qb.skip(skip).take(take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async createUser(user: NewUser): Promise<CreatedUserRow> {
    try {
      const result = await this.users.insert({
        email: user.email,
        username: user.username,
        password: user.passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        // INV-02: set explicitly so a column default can never grant privileges.
        isSuperuser: false,
        isStaff: false,
        isEmailVerified: false,
        isPasswordAutoset: false,
        isPasswordResetRequired: false,
        isPasswordExpired: false,
        createdById: user.createdById,
        dateJoined: user.at,
        createdAt: user.at,
        updatedAt: user.at,
      });
      const id: unknown = result.identifiers[0]?.id;
      if (typeof id !== 'string') {
        throw new Error('Insert returned no id');
      }
      return { id, createdAt: user.at };
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_key')) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }
}
