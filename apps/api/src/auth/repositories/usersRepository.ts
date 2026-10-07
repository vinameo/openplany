import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from '../entities/user.entity.js';

/** Columns a user may change on their own profile (profile database-spec 3.3). */
export interface ProfileChanges {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

/** Row shape of the `UPDATE … RETURNING` in updateProfile. */
interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar: string | null;
  user_timezone: string;
  is_email_verified: boolean;
  is_superuser: boolean;
}

const PROFILE_RETURNING =
  'id, email, first_name, last_name, display_name, avatar, user_timezone, is_email_verified, is_superuser';

export abstract class UsersRepository {
  /** `email` must already be trimmed and lower-cased. */
  abstract findByEmail(email: string): Promise<User | null>;

  /** null when missing, deactivated or masked. */
  abstract findActiveById(id: string): Promise<User | null>;

  /**
   * Writes the given columns and `updated_at` in one statement. null when no
   * active user matched, e.g. the account was locked after the session check.
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
    return this.users
      .createQueryBuilder('user')
      .where('lower(user.email) = :email', { email })
      .getOne();
  }

  findActiveById(id: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .andWhere('user.is_active = true')
      .andWhere('user.masked_at IS NULL')
      .getOne();
  }

  async updateProfile(
    id: string,
    changes: ProfileChanges,
    at: Date,
  ): Promise<User | null> {
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ ...changes, updatedAt: at })
      .where('id = :id', { id })
      .andWhere('is_active = true')
      .andWhere('masked_at IS NULL')
      .returning(PROFILE_RETURNING)
      .execute();

    const [row] = result.raw as ProfileRow[];
    if (row === undefined) return null;
    return Object.assign(new User(), {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      avatar: row.avatar,
      timezone: row.user_timezone,
      isEmailVerified: row.is_email_verified,
      isSuperuser: row.is_superuser,
    });
  }
}
