import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { QueryFailedError } from 'typeorm';
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

  it('inserts user and returns id and createdAt', async () => {
    const mockQuery = vi.fn().mockResolvedValue([
      { id: 'user-uuid-123', created_at: new Date('2026-10-09T10:00:00.000Z') },
    ]);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    const result = await repo.createUser(sampleUser);

    expect(result).toEqual({
      id: 'user-uuid-123',
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([
      sampleUser.email,
      sampleUser.username,
      sampleUser.passwordHash,
      sampleUser.firstName,
      sampleUser.lastName,
      sampleUser.displayName,
      sampleUser.createdById,
      sampleUser.at,
    ]);
  });

  it('throws EmailAlreadyExistsError on 23505 with users_email_lower_key', async () => {
    const queryError = new QueryFailedError('query', [], new Error('duplicate key'));
    Object.assign(queryError, {
      driverError: {
        code: '23505',
        constraint: 'users_email_lower_key',
      },
    });
    const mockQuery = vi.fn().mockRejectedValue(queryError);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    await expect(repo.createUser(sampleUser)).rejects.toThrow(
      EmailAlreadyExistsError,
    );
  });

  it('rethrows original QueryFailedError on 23505 with different constraint', async () => {
    const queryError = new QueryFailedError('query', [], new Error('duplicate key'));
    Object.assign(queryError, {
      driverError: {
        code: '23505',
        constraint: 'users_username_key',
      },
    });
    const mockQuery = vi.fn().mockRejectedValue(queryError);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    await expect(repo.createUser(sampleUser)).rejects.toBe(queryError);
  });

  it('rethrows other errors unmodified', async () => {
    const generalError = new Error('Connection lost');
    const mockQuery = vi.fn().mockRejectedValue(generalError);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    await expect(repo.createUser(sampleUser)).rejects.toBe(generalError);
  });

  it('rethrows QueryFailedError when driverError is undefined or null', async () => {
    const queryError = new QueryFailedError('query', [], new Error('generic db error'));
    const mockQuery = vi.fn().mockRejectedValue(queryError);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    await expect(repo.createUser(sampleUser)).rejects.toBe(queryError);
  });

  it('throws if query returned empty rows', async () => {
    const mockQuery = vi.fn().mockResolvedValue([]);
    const dataSource = { query: mockQuery } as unknown as DataSource;
    const repo = new TypeOrmAdminUsersRepository(dataSource);

    await expect(repo.createUser(sampleUser)).rejects.toThrow(
      'Insert returned no rows',
    );
  });
});
