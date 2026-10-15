import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type FindOptionsWhere, IsNull, type Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import { containsIgnoringCaseAndAccentsSql } from '../../database/findOperators.js';
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

export abstract class AdminUsersRepository {
  /** Inserts one user with every privilege flag forced to false (INV-02). */
  abstract createUser(user: NewUser): Promise<CreatedUserRow>;
  /** Queries listed users with pagination and ordering (INV-02, INV-03). */
  abstract list(
    query: AdminUserListQuery,
  ): Promise<{ items: User[]; total: number }>;
}

@Injectable()
export class TypeOrmAdminUsersRepository extends AdminUsersRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
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
