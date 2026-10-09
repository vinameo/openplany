import { HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock, FakePasswordHasher } from '../../test/fakes/authFakes.js';
import type { User } from '../auth/entities/user.entity.js';
import type { UsersRepository } from '../auth/repositories/usersRepository.js';
import { AdminUsersService } from './adminUsers.service.js';
import type { CreateUserDto } from './dto/createUser.dto.js';
import type { UserCreatedEvent, UserEvents } from './events/userEvents.js';
import {
  type AdminUsersRepository,
  EmailAlreadyExistsError,
  type NewUser,
} from './repositories/adminUsersRepository.js';

describe('AdminUsersService', () => {
  const sampleDto = {
    firstName: 'An',
    lastName: 'Nguyen',
    displayName: 'An Nguyen',
    email: 'an@openplany.dev',
    password: 'securePassword123',
  };

  function setup() {
    const callOrder: string[] = [];

    const findByEmailMock = vi.fn(async () => {
      callOrder.push('findByEmail');
      return null as User | null;
    });
    const usersRepo = {
      findByEmail: findByEmailMock,
    } as unknown as UsersRepository;

    let capturedNewUser: NewUser | null = null;
    const createUserMock = vi.fn(async (newUser: NewUser) => {
      callOrder.push('createUser');
      capturedNewUser = newUser;
      return {
        id: 'user-created-uuid-1',
        createdAt: new Date('2026-10-09T10:00:00.000Z'),
      };
    });
    const adminUsersRepo = {
      createUser: createUserMock,
    } as unknown as AdminUsersRepository;

    const hasher = new FakePasswordHasher();
    const originalHash = hasher.hash.bind(hasher);
    const hashMock = vi.fn(async (pwd: string) => {
      callOrder.push('hash');
      return originalHash(pwd);
    });
    hasher.hash = hashMock;

    let capturedEvent: UserCreatedEvent | null = null;
    const createdEventMock = vi.fn(async (event: UserCreatedEvent) => {
      callOrder.push('events.created');
      capturedEvent = event;
    });
    const events = {
      created: createdEventMock,
    } as unknown as UserEvents;

    const clock = new FakeClock(new Date('2026-10-09T10:00:00.000Z'));

    const service = new AdminUsersService(
      usersRepo,
      adminUsersRepo,
      hasher,
      events,
      clock,
    );

    return {
      service,
      findByEmailMock,
      createUserMock,
      hashMock,
      createdEventMock,
      clock,
      callOrder,
      getCapturedNewUser: () => capturedNewUser,
      getCapturedEvent: () => capturedEvent,
    };
  }

  it('(1) successful flow executes S2->S3->S4->S5 and returns created user without password', async () => {
    const ctx = setup();
    const result = await ctx.service.create('admin-id-1', sampleDto, 'req-id-1');

    expect(ctx.callOrder).toEqual(['findByEmail', 'hash', 'createUser', 'events.created']);
    expect(result).toEqual({
      id: 'user-created-uuid-1',
      email: 'an@openplany.dev',
      firstName: 'An',
      lastName: 'Nguyen',
      displayName: 'An Nguyen',
      isInstanceAdmin: false,
      createdAt: '2026-10-09T10:00:00.000Z',
    });
    const rawResult = result as unknown as Record<string, unknown>;
    expect(rawResult.password).toBeUndefined();
    expect(rawResult.passwordHash).toBeUndefined();
    expect(rawResult.username).toBeUndefined();
    expect(rawResult.createdById).toBeUndefined();

    expect(ctx.getCapturedEvent()).toEqual({
      userId: 'user-created-uuid-1',
      actorId: 'admin-id-1',
      occurredAt: new Date('2026-10-09T10:00:00.000Z'),
      requestId: 'req-id-1',
    });
  });

  it('(2) password = email throws 400 and does not call findByEmail or hash', async () => {
    const ctx = setup();
    const dtoWithSamePassword: CreateUserDto = {
      ...sampleDto,
      email: 'an@openplany.dev',
      password: 'An@OpenPlany.dev',
    };

    await expect(ctx.service.create('admin-id-1', dtoWithSamePassword, 'req-1')).rejects.toThrow(
      expect.objectContaining({
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        fields: {
          password: "Password can't be the same as the email",
        },
      }),
    );

    expect(ctx.callOrder).toEqual([]);
    expect(ctx.findByEmailMock).not.toHaveBeenCalled();
    expect(ctx.hashMock).not.toHaveBeenCalled();
  });

  it('(3) email exists in S2 throws 409 and does not call hash or createUser', async () => {
    const ctx = setup();
    ctx.findByEmailMock.mockImplementationOnce(async () => {
      ctx.callOrder.push('findByEmail');
      return { id: 'existing-user' } as User;
    });

    await expect(ctx.service.create('admin-id-1', sampleDto, 'req-1')).rejects.toThrow(
      expect.objectContaining({
        status: HttpStatus.CONFLICT,
        code: 'EMAIL_ALREADY_EXISTS',
        fields: {
          email: 'A user with this email already exists.',
        },
      }),
    );

    expect(ctx.callOrder).toEqual(['findByEmail']);
    expect(ctx.findByEmailMock).toHaveBeenCalledWith(sampleDto.email);
    expect(ctx.hashMock).not.toHaveBeenCalled();
    expect(ctx.createUserMock).not.toHaveBeenCalled();
  });

  it('(4) createUser throws EmailAlreadyExistsError in S4 -> throws 409', async () => {
    const ctx = setup();
    ctx.createUserMock.mockRejectedValueOnce(new EmailAlreadyExistsError());

    await expect(ctx.service.create('admin-id-1', sampleDto, 'req-1')).rejects.toThrow(
      expect.objectContaining({
        status: HttpStatus.CONFLICT,
        code: 'EMAIL_ALREADY_EXISTS',
        fields: {
          email: 'A user with this email already exists.',
        },
      }),
    );

    expect(ctx.createdEventMock).not.toHaveBeenCalled();
  });

  it('(5) createUser throws other error in S4 -> rethrows error', async () => {
    const ctx = setup();
    const dbError = new Error('Database deadlocked');
    ctx.createUserMock.mockRejectedValueOnce(dbError);

    await expect(ctx.service.create('admin-id-1', sampleDto, 'req-1')).rejects.toBe(dbError);
    expect(ctx.createdEventMock).not.toHaveBeenCalled();
  });

  it('(6) events throws error in S5 -> logs error and still returns created user', async () => {
    const ctx = setup();
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    ctx.createdEventMock.mockRejectedValueOnce(new Error('Kafka unreachable'));

    try {
      const result = await ctx.service.create('admin-id-1', sampleDto, 'req-event-fail');

      expect(result.id).toBe('user-created-uuid-1');
      expect(errorSpy).toHaveBeenCalledWith(
        'user.created event failed userId=user-created-uuid-1 requestId=req-event-fail',
        expect.stringContaining('Kafka unreachable'),
      );

      // Also test non-Error thrown
      ctx.createdEventMock.mockRejectedValueOnce('string error');
      await ctx.service.create('admin-id-1', sampleDto, 'req-event-string');
      expect(errorSpy).toHaveBeenCalledWith(
        'user.created event failed userId=user-created-uuid-1 requestId=req-event-string',
        'string error',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('(7) omitted lastName defaults to empty string in repository', async () => {
    const ctx = setup();
    const dtoWithoutLast: CreateUserDto = {
      firstName: 'Solo',
      displayName: 'Solo',
      email: 'solo@openplany.dev',
      password: 'password123',
    };

    const result = await ctx.service.create('admin-id-1', dtoWithoutLast, 'req-1');

    expect(result.lastName).toBe('');
    expect(ctx.getCapturedNewUser()?.lastName).toBe('');
  });

  it('(8) generated username matches 32 hex characters', async () => {
    const ctx = setup();
    await ctx.service.create('admin-id-1', sampleDto, 'req-1');

    const username = ctx.getCapturedNewUser()?.username;
    expect(username).toMatch(/^[0-9a-f]{32}$/);
  });
});
