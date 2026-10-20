import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  type FindOptionsWhere,
  IsNull,
  type Repository,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import {
  EmailAlreadyExistsError,
  type LockedUserWrites,
  LockedUsersRepository,
} from '../../auth/repositories/lockedUsers.js';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import {
  containsIgnoringCaseAndAccentsSql,
} from '../../database/findOperators.js';
import { matchesWhere } from '../../database/matchesWhere.js';
import { addOrderByEmptyAndNullLast } from '../../database/sortHelpers.js';
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

@Injectable()
export class TypeOrmAdminUsersRepository extends AdminUsersRepository {
  private readonly logger = new Logger(TypeOrmAdminUsersRepository.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly lockedUsers: LockedUsersRepository,
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
    return this.lockedUsers.withLockedUsers(
      [actorId, targetId],
      async ({ rows, writes }) => {
        return work({
          actor: rows.get(actorId) ?? null,
          target: rows.get(targetId) ?? null,
          writes,
        });
      },
      (attempt) => {
        this.logger.warn(
          `admin.users.lock.retry actorId=${actorId} userId=${targetId} attempt=${attempt}`,
        );
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
