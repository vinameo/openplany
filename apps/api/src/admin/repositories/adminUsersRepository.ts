import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
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
import { addOrderByEmptyAndNullLast } from '../../database/sortHelpers.js';
import { ListAdminUsersQueryDto } from '../dto/listAdminUsersQuery.dto.js';

import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserListQuery,
  defaultAdminUserOrder,
} from '@repo/contracts';

/**
 * INV-02: Single source of truth for "who appears in the Users page":
 * not a bot and not anonymized/masked.
 */
export const LISTED_USER: FindOptionsWhere<User> = {
  isBot: false,
  maskedAt: IsNull(),
};

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

export class ActorForbiddenError extends Error {
  constructor() {
    super('Actor is not an active non-masked instance admin');
    this.name = 'ActorForbiddenError';
  }
}

export class TargetNotFoundError extends Error {
  constructor() {
    super('Target user not found or not a listed user');
    this.name = 'TargetNotFoundError';
  }
}

export class UserChangedSinceLoadedError extends Error {
  constructor() {
    super('Target user was updated since loaded');
    this.name = 'UserChangedSinceLoadedError';
  }
}

export class PasswordSameAsEmailError extends Error {
  constructor() {
    super('Password cannot be the same as email');
    this.name = 'PasswordSameAsEmailError';
  }
}

export interface UpdateUserFields {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
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
  /** Locks actor and target users by id in ASC order and verifies permissions (DB B5 steps 1-3, BA FC-01). */
  abstract lockActorAndTarget(
    manager: EntityManager,
    actorId: string,
    targetId: string,
  ): Promise<{ actor: User; target: User }>;
  /** Updates a user within a transaction following DB B5. */
  abstract updateUser(
    actorId: string,
    targetId: string,
    updates: UpdateUserFields,
    expectedUpdatedAt: string,
    at: Date,
  ): Promise<{ user: User; changedFields: string[] }>;
  /** Changes a user's password, resets password flags, and revokes all active sessions following DB B6. */
  abstract changePassword(
    actorId: string,
    targetId: string,
    passwordHash: string,
    rawPassword: string,
    at: Date,
  ): Promise<{ revokedSessionCount: number }>;
}

@Injectable()
export class TypeOrmAdminUsersRepository extends AdminUsersRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({
      where: {
        id,
        ...LISTED_USER,
      },
    });
  }

  async lockActorAndTarget(
    manager: EntityManager,
    actorId: string,
    targetId: string,
  ): Promise<{ actor: User; target: User }> {
    // 1. Lock rows sorted by id ASC (avoids deadlocks on cross-updates)
    // Actor = target -> one row. Do not filter LISTED_USER in this query.
    const lockedRows = await manager.find(User, {
      where: { id: In([actorId, targetId]) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    const actor = lockedRows.find((u) => u.id === actorId);
    // 2. Actor check: exists, isSuperuser = true, isActive = true, maskedAt IS NULL
    if (
      !actor ||
      !actor.isSuperuser ||
      !actor.isActive ||
      actor.maskedAt !== null
    ) {
      throw new ActorForbiddenError();
    }

    const target = lockedRows.find((u) => u.id === targetId);
    // 3. Target check: exists, isBot = false, maskedAt === null
    if (!target || target.isBot || target.maskedAt !== null) {
      throw new TargetNotFoundError();
    }

    return { actor, target };
  }

  async updateUser(
    actorId: string,
    targetId: string,
    updates: UpdateUserFields,
    expectedUpdatedAt: string,
    at: Date,
  ): Promise<{ user: User; changedFields: string[] }> {
    return this.dataSource.transaction(async (manager) => {
      // Steps 1-3: Lock & check actor and target
      const { target } = await this.lockActorAndTarget(
        manager,
        actorId,
        targetId,
      );

      // Step 4: Stale data check in JS comparing milliseconds
      if (target.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
        throw new UserChangedSinceLoadedError();
      }

      // Step 5: Calculate changes
      const changes: Partial<User> = {};
      const changedFields: string[] = [];

      if (
        updates.firstName !== undefined &&
        (target.firstName ?? '') !== updates.firstName
      ) {
        changes.firstName = updates.firstName;
        changedFields.push('firstName');
      }
      if (
        updates.lastName !== undefined &&
        (target.lastName ?? '') !== updates.lastName
      ) {
        changes.lastName = updates.lastName;
        changedFields.push('lastName');
      }
      if (
        updates.displayName !== undefined &&
        (target.displayName ?? '') !== updates.displayName
      ) {
        changes.displayName = updates.displayName;
        changedFields.push('displayName');
      }
      const emailChanged =
        updates.email !== undefined &&
        (target.email ?? '').toLowerCase() !== updates.email.toLowerCase();
      if (emailChanged && updates.email !== undefined) {
        changes.email = updates.email;
        changes.isEmailVerified = false;
        changedFields.push('email');
      }

      // If no changes, return target without writing (INV-07)
      if (changedFields.length === 0) {
        return { user: target, changedFields: [] };
      }

      // Step 6: Email conflict check
      if (emailChanged && changes.email) {
        const existing = await manager.findOne(User, {
          where: { email: equalsLowercase(changes.email), id: Not(targetId) },
        });
        if (existing !== null) {
          throw new EmailAlreadyExistsError();
        }
      }

      // Step 7: Write updates
      changes.updatedAt = at;
      try {
        await manager.update(User, targetId, changes);
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_lower_key')) {
          throw new EmailAlreadyExistsError();
        }
        throw error;
      }

      // Step 8: Return updated user
      const updatedUser: User = Object.assign(target, changes);
      return { user: updatedUser, changedFields };
    });
  }

  async changePassword(
    actorId: string,
    targetId: string,
    passwordHash: string,
    rawPassword: string,
    at: Date,
  ): Promise<{ revokedSessionCount: number }> {
    return this.dataSource.transaction(async (manager) => {
      // Steps 1-3: Lock & check actor and target
      const { target } = await this.lockActorAndTarget(
        manager,
        actorId,
        targetId,
      );

      // Step 4: Password !== target email
      if (rawPassword.toLowerCase() === (target.email ?? '').toLowerCase()) {
        throw new PasswordSameAsEmailError();
      }

      // Step 5: Write password, clear 3 password flags, set updatedAt
      await manager.update(User, targetId, {
        password: passwordHash,
        isPasswordAutoset: false,
        isPasswordExpired: false,
        isPasswordResetRequired: false,
        updatedAt: at,
      });

      // Step 6: Revoke all active sessions
      const sessionResult = await manager.update(
        Session,
        { userId: targetId, revokedAt: IsNull() },
        { revokedAt: at },
      );

      return { revokedSessionCount: sessionResult.affected ?? 0 };
    });
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
      .where('u.isBot = :isBot', { isBot: false })
      .andWhere('u.maskedAt IS NULL');

    // Filter status (active, deactivated, all)
    if (query.status === 'active') {
      qb.andWhere('u.isActive = :isActive', { isActive: true });
    } else if (query.status === 'deactivated') {
      qb.andWhere('u.isActive = :isActive', { isActive: false });
    }

    // Filter instanceAdmin (only)
    if (query.instanceAdmin === 'only') {
      qb.andWhere('u.isSuperuser = :isSuperuser', { isSuperuser: true });
    }

    // Search terms (up to 5 words, AND of OR groups across fields)
    let terms: string[] = [];
    if (query instanceof ListAdminUsersQueryDto) {
      terms = query.searchTerms;
    } else if (query.search && query.search.trim() !== '') {
      terms = query.search
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .slice(0, 5);
    }

    terms.forEach((term, index) => {
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
