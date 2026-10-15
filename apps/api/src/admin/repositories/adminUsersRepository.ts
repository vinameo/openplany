import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, IsNull, type Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { isUniqueViolation } from '../../common/databaseErrors.js';

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

    const [items, total] = await this.users.findAndCount({
      where: LISTED_USER,
      order: {
        createdAt: orderDirection,
        id: orderDirection,
      },
      skip,
      take,
    });

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
