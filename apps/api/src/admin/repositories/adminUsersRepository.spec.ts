import { describe, expect, it, vi } from 'vitest';
import { QueryFailedError, type Repository } from 'typeorm';
import type { User } from '../../auth/entities/user.entity.js';
import {
  EmailAlreadyExistsError,
  type NewUser,
  TypeOrmAdminUsersRepository,
} from './adminUsersRepository.js';

describe('TypeOrmAdminUsersRepository', () => {
  const sampleUser: NewUser = {
    email: 'an@openplany.dev',
    username: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$fakehash',
    firstName: 'An',
    lastName: 'Nguyen',
    displayName: 'An Nguyen',
    createdById: 'admin-uuid-1',
    at: new Date('2026-10-09T10:00:00.000Z'),
  };

  function repoWith(insert: ReturnType<typeof vi.fn>) {
    const users = { insert } as unknown as Repository<User>;
    return new TypeOrmAdminUsersRepository(users);
  }

  it('inserts user with every privilege flag false and returns id and createdAt', async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ identifiers: [{ id: 'user-uuid-123' }] });
    const repo = repoWith(insert);

    const result = await repo.createUser(sampleUser);

    expect(result).toEqual({
      id: 'user-uuid-123',
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toEqual({
      email: sampleUser.email,
      username: sampleUser.username,
      password: sampleUser.passwordHash,
      firstName: sampleUser.firstName,
      lastName: sampleUser.lastName,
      displayName: sampleUser.displayName,
      isSuperuser: false,
      isStaff: false,
      isEmailVerified: false,
      isPasswordAutoset: false,
      isPasswordResetRequired: false,
      isPasswordExpired: false,
      createdById: sampleUser.createdById,
      dateJoined: sampleUser.at,
      createdAt: sampleUser.at,
      updatedAt: sampleUser.at,
    });
  });

  it('throws EmailAlreadyExistsError on 23505 with users_email_lower_key', async () => {
    const queryError = new QueryFailedError(
      'query',
      [],
      new Error('duplicate key'),
    );
    Object.assign(queryError, {
      driverError: {
        code: '23505',
        constraint: 'users_email_lower_key',
      },
    });
    const repo = repoWith(vi.fn().mockRejectedValue(queryError));

    await expect(repo.createUser(sampleUser)).rejects.toThrow(
      EmailAlreadyExistsError,
    );
  });

  it('rethrows original QueryFailedError on 23505 with different constraint', async () => {
    const queryError = new QueryFailedError(
      'query',
      [],
      new Error('duplicate key'),
    );
    Object.assign(queryError, {
      driverError: {
        code: '23505',
        constraint: 'users_username_key',
      },
    });
    const repo = repoWith(vi.fn().mockRejectedValue(queryError));

    await expect(repo.createUser(sampleUser)).rejects.toBe(queryError);
  });

  it('rethrows other errors unmodified', async () => {
    const generalError = new Error('Connection lost');
    const repo = repoWith(vi.fn().mockRejectedValue(generalError));

    await expect(repo.createUser(sampleUser)).rejects.toBe(generalError);
  });

  it('rethrows QueryFailedError when driverError is undefined or null', async () => {
    const queryError = new QueryFailedError(
      'query',
      [],
      new Error('generic db error'),
    );
    const repo = repoWith(vi.fn().mockRejectedValue(queryError));

    await expect(repo.createUser(sampleUser)).rejects.toBe(queryError);
  });

  it('throws if the insert returned no id', async () => {
    const repo = repoWith(vi.fn().mockResolvedValue({ identifiers: [] }));

    await expect(repo.createUser(sampleUser)).rejects.toThrow(
      'Insert returned no id',
    );
  });
});
