import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type FindOptionsWhere, type Repository } from 'typeorm';
import { equalsLowercase } from '../../database/findOperators.js';
import { matchesWhere } from '../../database/matchesWhere.js';
import { User } from '../entities/user.entity.js';

/** Columns a user may change on their own profile (profile database-spec 3.3). */
export interface ProfileChanges {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

/** Who counts as a usable account: not deactivated, not masked. */
export const ACTIVE_USER: FindOptionsWhere<User> = { isActive: true, maskedAt: IsNull() };

export const isUsableUser = (user: User): boolean => matchesWhere(user, ACTIVE_USER);

export abstract class UsersRepository {
  /** `email` must already be trimmed and lower-cased. */
  abstract findByEmail(email: string): Promise<User | null>;

  /** null when missing, deactivated or masked. */
  abstract findActiveById(id: string): Promise<User | null>;

  /**
   * Writes the given columns and `updated_at` in one UPDATE, then reads the
   * row back in the same transaction. null when no active user matched, e.g.
   * the account was locked after the session check.
   */
  abstract updateProfile(
    id: string,
    changes: ProfileChanges,
    at: Date,
  ): Promise<User | null>;
}

@Injectable()
export class TypeOrmUsersRepository extends UsersRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }

  findByEmail(email: string): Promise<User | null> {
    // Matches the users_email_lower_key expression index exactly.
    return this.users.findOne({ where: { email: equalsLowercase(email) } });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { ...ACTIVE_USER, id } });
  }

  updateProfile(
    id: string,
    changes: ProfileChanges,
    at: Date,
  ): Promise<User | null> {
    return this.users.manager.transaction(async (manager) => {
      const result = await manager.update(
        User,
        { ...ACTIVE_USER, id },
        { ...changes, updatedAt: at },
      );
      if (result.affected === 0) return null;
      return manager.findOne(User, { where: { id } });
    });
  }
}
