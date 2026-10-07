import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from '../entities/user.entity.js';

export abstract class UsersRepository {
  /** `email` must already be trimmed and lower-cased. */
  abstract findByEmail(email: string): Promise<User | null>;
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
}
