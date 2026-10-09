import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';

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
}

const INSERT_USER_SQL = `INSERT INTO users (
  email, username, password, first_name, last_name, display_name,
  is_superuser, is_staff, is_email_verified,
  is_password_autoset, is_password_reset_required, is_password_expired,
  created_by_id, date_joined, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  false, false, false,
  false, false, false,
  $7, $8, $8, $8
)
RETURNING id, created_at`;

function isEmailTaken(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as
    | { code?: unknown; constraint?: unknown }
    | undefined;
  return (
    driverError?.code === '23505' &&
    driverError?.constraint === 'users_email_lower_key'
  );
}

@Injectable()
export class TypeOrmAdminUsersRepository extends AdminUsersRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async createUser(user: NewUser): Promise<CreatedUserRow> {
    try {
      const rows = await this.dataSource.query<{ id: string; created_at: Date }[]>(
        INSERT_USER_SQL,
        [
          user.email,
          user.username,
          user.passwordHash,
          user.firstName,
          user.lastName,
          user.displayName,
          user.createdById,
          user.at,
        ],
      );
      const row = rows[0];
      if (!row) {
        throw new Error('Insert returned no rows');
      }
      return {
        id: row.id,
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      if (isEmailTaken(error)) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }
}

