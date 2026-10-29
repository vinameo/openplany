import { HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FakeAdminUsersRepository } from '../../test/fakes/adminUsersFakes.js';
import {
  FakeClock,
  FakePasswordHasher,
  makeUser,
} from '../../test/fakes/authFakes.js';
import type { User } from '../auth/entities/user.entity.js';
import type { UsersRepository } from '../auth/repositories/usersRepository.js';
import { PasswordConfirmation } from '../auth/passwordConfirmation.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import {
  ADMIN_REAUTH_CONFIRMATION_OPTIONS,
  REAUTH_FAILURE_LIMIT,
} from './adminReauthentication.js';
import { AdminUsersService } from './adminUsers.service.js';
import type { CreateUserDto } from './dto/createUser.dto.js';
import type {
  UserCreatedEvent,
  UserPasswordChangedEvent,
  UserUpdatedEvent,
  UserEvents,
} from '../users/events/userEvents.js';
import { EmailAlreadyExistsError } from '../auth/repositories/lockedUsers.js';
import type { NewUser } from './repositories/adminUsersRepository.js';

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
    const adminUsersRepo = new FakeAdminUsersRepository();
    const usersRepo = {
      findByEmail: findByEmailMock,
      findActiveById: async (id: string) =>
        adminUsersRepo.users.find(
          (user) => user.id === id && user.isActive && user.maskedAt === null,
        ) ?? null,
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
    const listMock = vi.fn(async () => ({
      items: [] as User[],
      total: 0,
    }));
    const findByIdMock = vi.fn(async () => null as User | null);
    adminUsersRepo.createUser = createUserMock;
    adminUsersRepo.list = listMock;
    adminUsersRepo.findById = findByIdMock;

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
    let capturedUpdatedEvent: UserUpdatedEvent | null = null;
    const updatedEventMock = vi.fn(async (event: UserUpdatedEvent) => {
      callOrder.push('events.updated');
      capturedUpdatedEvent = event;
    });
    let capturedPasswordChangedEvent: UserPasswordChangedEvent | null = null;
    const passwordChangedEventMock = vi.fn(
      async (event: UserPasswordChangedEvent) => {
        callOrder.push('events.passwordChanged');
        capturedPasswordChangedEvent = event;
      },
    );
    const events = {
      created: createdEventMock,
      updated: updatedEventMock,
      passwordChanged: passwordChangedEventMock,
    } as unknown as UserEvents;

    const clock = new FakeClock(new Date('2026-10-09T10:00:00.000Z'));

    const { failureLimit, ...reauthConfig } = ADMIN_REAUTH_CONFIRMATION_OPTIONS;
    const reauthentication = new PasswordConfirmation(
      {
        ...reauthConfig,
        limiter: new InMemorySlidingWindowLimiter(failureLimit),
      },
      usersRepo,
      hasher,
      clock,
    );

    const service = new AdminUsersService(
      usersRepo,
      adminUsersRepo,
      hasher,
      events,
      clock,
      reauthentication,
    );

    return {
      service,
      adminUsersRepo,
      listMock,
      findByIdMock,
      findByEmailMock,
      createUserMock,
      hashMock,
      createdEventMock,
      updatedEventMock,
      passwordChangedEventMock,
      clock,
      callOrder,
      getCapturedNewUser: () => capturedNewUser,
      getCapturedEvent: () => capturedEvent,
      getCapturedUpdatedEvent: () => capturedUpdatedEvent,
      getCapturedPasswordChangedEvent: () => capturedPasswordChangedEvent,
    };
  }

  it('(1) successful flow executes S2->S3->S4->S5 and returns created user without password', async () => {
    const ctx = setup();
    const result = await ctx.service.create(
      'admin-id-1',
      sampleDto,
      'req-id-1',
    );

    expect(ctx.callOrder).toEqual([
      'findByEmail',
      'hash',
      'createUser',
      'events.created',
    ]);
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

    await expect(
      ctx.service.create('admin-id-1', dtoWithSamePassword, 'req-1'),
    ).rejects.toThrow(
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

    await expect(
      ctx.service.create('admin-id-1', sampleDto, 'req-1'),
    ).rejects.toThrow(
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

    await expect(
      ctx.service.create('admin-id-1', sampleDto, 'req-1'),
    ).rejects.toThrow(
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

    await expect(
      ctx.service.create('admin-id-1', sampleDto, 'req-1'),
    ).rejects.toBe(dbError);
    expect(ctx.createdEventMock).not.toHaveBeenCalled();
  });

  it('(6) events throws error in S5 -> logs error and still returns created user', async () => {
    const ctx = setup();
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    ctx.createdEventMock.mockRejectedValueOnce(new Error('Kafka unreachable'));

    try {
      const result = await ctx.service.create(
        'admin-id-1',
        sampleDto,
        'req-event-fail',
      );

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

    const result = await ctx.service.create(
      'admin-id-1',
      dtoWithoutLast,
      'req-1',
    );

    expect(result.lastName).toBe('');
    expect(ctx.getCapturedNewUser()?.lastName).toBe('');
  });

  it('(8) generated username matches 32 hex characters', async () => {
    const ctx = setup();
    await ctx.service.create('admin-id-1', sampleDto, 'req-1');

    const username = ctx.getCapturedNewUser()?.username;
    expect(username).toMatch(/^[0-9a-f]{32}$/);
  });

  describe('list', () => {
    it('calls repository.list and maps items with toAdminUserResponse', async () => {
      const ctx = setup();
      const mockUsers: User[] = [
        {
          id: 'u-1',
          email: 'u1@example.com',
          firstName: 'An',
          lastName: 'Nguyen',
          displayName: 'An Nguyen',
          avatar: 'https://example.com/avatar.png',
          isActive: true,
          isSuperuser: true,
          createdAt: new Date('2026-10-09T10:00:00.000Z'),
          updatedAt: new Date('2026-10-09T10:00:00.000Z'),
        } as User,
      ];
      ctx.listMock.mockResolvedValueOnce({
        items: mockUsers,
        total: 101,
      });

      const result = await ctx.service.list({ page: 2 });

      expect(ctx.listMock).toHaveBeenCalledWith({ page: 2 });
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
      expect(result.total).toBe(101);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'u-1',
        email: 'u1@example.com',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatarUrl: 'https://example.com/avatar.png',
        isActive: true,
        isInstanceAdmin: true,
        createdAt: '2026-10-09T10:00:00.000Z',
        updatedAt: '2026-10-09T10:00:00.000Z',
      });
    });

    it('defaults page to 1 when page is undefined or negative', async () => {
      const ctx = setup();
      ctx.listMock.mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const result = await ctx.service.list({});
      expect(result.page).toBe(1);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('get', () => {
    it('returns AdminUserResponse when user is found', async () => {
      const ctx = setup();
      ctx.findByIdMock.mockResolvedValueOnce({
        id: 'u-1',
        email: 'u1@example.com',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatar: null,
        isActive: true,
        isSuperuser: false,
        createdAt: new Date('2026-10-09T10:00:00.000Z'),
        updatedAt: new Date('2026-10-09T10:00:00.000Z'),
      } as User);

      const result = await ctx.service.get('u-1');
      expect(result).toEqual({
        id: 'u-1',
        email: 'u1@example.com',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatarUrl: null,
        isActive: true,
        isInstanceAdmin: false,
        createdAt: '2026-10-09T10:00:00.000Z',
        updatedAt: '2026-10-09T10:00:00.000Z',
      });
      expect(ctx.findByIdMock).toHaveBeenCalledWith('u-1');
    });

    it('throws 404 USER_NOT_FOUND when user does not exist', async () => {
      const ctx = setup();
      ctx.findByIdMock.mockResolvedValueOnce(null);

      await expect(ctx.service.get('missing-uuid')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
          code: 'USER_NOT_FOUND',
        }),
      );
    });
  });

  const LOADED_AT = new Date('2026-10-09T09:00:00.000Z');

  function withUsers(
    ctx: ReturnType<typeof setup>,
    target: Partial<User> = {},
  ) {
    const actor = makeUser({
      id: 'actor-kai',
      email: 'kai@openplany.dev',
      password: 'hash:KaiSecret1!',
      isSuperuser: true,
    });
    const user = makeUser({
      id: 'u-1',
      email: 'an@openplany.dev',
      createdAt: LOADED_AT,
      updatedAt: LOADED_AT,
      ...target,
    });
    ctx.adminUsersRepo.users.push(actor, user);
    return { actor, user };
  }

  describe('locked-row checks shared by update and changePassword (DB B5/B6 steps 1-3)', () => {
    const calls = {
      update: (ctx: ReturnType<typeof setup>) =>
        ctx.service.update(
          'actor-kai',
          'u-1',
          { expectedUpdatedAt: LOADED_AT.toISOString(), firstName: 'Binh' },
          'req-1',
        ),
      changePassword: (ctx: ReturnType<typeof setup>) =>
        ctx.service.changePassword(
          'actor-kai',
          'u-1',
          { password: 'NewPassword123!' },
          'req-1',
        ),
    };

    for (const [name, call] of Object.entries(calls)) {
      it(`${name}: 403 FORBIDDEN when the locked actor is no longer an active instance admin`, async () => {
        for (const actorChange of [
          { isSuperuser: false },
          { isActive: false },
          { maskedAt: new Date() },
        ]) {
          const ctx = setup();
          const { actor } = withUsers(ctx);
          Object.assign(actor, actorChange);
          await expect(call(ctx)).rejects.toThrow(
            expect.objectContaining({
              status: HttpStatus.FORBIDDEN,
              code: 'FORBIDDEN',
            }),
          );
          expect(ctx.adminUsersRepo.updates).toEqual([]);
        }
      });

      it(`${name}: 404 USER_NOT_FOUND when the target is missing, a bot or masked`, async () => {
        for (const targetChange of [
          { isBot: true },
          { maskedAt: new Date() },
          null,
        ]) {
          const ctx = setup();
          withUsers(ctx, targetChange ?? {});
          if (targetChange === null) ctx.adminUsersRepo.users.pop();
          await expect(call(ctx)).rejects.toThrow(
            expect.objectContaining({
              status: HttpStatus.NOT_FOUND,
              code: 'USER_NOT_FOUND',
            }),
          );
          expect(ctx.adminUsersRepo.updates).toEqual([]);
        }
      });
    }
  });

  describe('update', () => {
    it('writes only changed fields, marks a new email unverified, emits events.updated', async () => {
      const ctx = setup();
      withUsers(ctx, { firstName: 'An', lastName: null });

      const result = await ctx.service.update(
        'actor-kai',
        'u-1',
        {
          expectedUpdatedAt: LOADED_AT.toISOString(),
          firstName: 'Binh',
          lastName: '',
          email: 'binh@openplany.dev',
        },
        'req-99',
      );

      // lastName '' equals NULL on the row: not a change (DB B5 step 5).
      expect(ctx.adminUsersRepo.updates).toEqual([
        {
          userId: 'u-1',
          changes: {
            firstName: 'Binh',
            email: 'binh@openplany.dev',
            isEmailVerified: false,
            updatedAt: ctx.clock.now(),
          },
        },
      ]);
      expect(ctx.getCapturedUpdatedEvent()).toEqual({
        userId: 'u-1',
        actorId: 'actor-kai',
        fields: ['firstName', 'email'],
        occurredAt: ctx.clock.now(),
        requestId: 'req-99',
      });
      expect(result.firstName).toBe('Binh');
      expect(result.email).toBe('binh@openplany.dev');
      expect(result.updatedAt).toBe(ctx.clock.now().toISOString());
    });

    it('keeps isEmailVerified when only names change', async () => {
      const ctx = setup();
      withUsers(ctx);
      await ctx.service.update(
        'actor-kai',
        'u-1',
        { expectedUpdatedAt: LOADED_AT.toISOString(), displayName: 'Bình' },
        'req-1',
      );
      expect(ctx.adminUsersRepo.updates[0]?.changes).toEqual({
        displayName: 'Bình',
        updatedAt: ctx.clock.now(),
      });
    });

    it('returns the row without writing or emitting when nothing changed (INV-07)', async () => {
      const ctx = setup();
      withUsers(ctx);

      const result = await ctx.service.update(
        'actor-kai',
        'u-1',
        {
          expectedUpdatedAt: LOADED_AT.toISOString(),
          firstName: 'An',
          email: 'AN@openplany.dev',
        },
        'req-99',
      );

      expect(ctx.adminUsersRepo.updates).toEqual([]);
      expect(ctx.updatedEventMock).not.toHaveBeenCalled();
      expect(result.updatedAt).toBe(LOADED_AT.toISOString());
    });

    it('409 USER_CHANGED_SINCE_LOADED and a conflict log when expectedUpdatedAt differs', async () => {
      const ctx = setup();
      withUsers(ctx);
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        await expect(
          ctx.service.update(
            'actor-kai',
            'u-1',
            {
              expectedUpdatedAt: '2026-10-09T09:00:00.001Z',
              firstName: 'Binh',
            },
            'req-99',
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            status: HttpStatus.CONFLICT,
            code: 'USER_CHANGED_SINCE_LOADED',
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          'admin.users.update.conflict userId=u-1 actorId=actor-kai requestId=req-99',
        );
        expect(ctx.adminUsersRepo.updates).toEqual([]);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('409 EMAIL_ALREADY_EXISTS when another row holds the email, and on a unique violation', async () => {
      const ctx = setup();
      withUsers(ctx);
      ctx.adminUsersRepo.users.push(
        makeUser({ id: 'bot-1', email: 'taken@openplany.dev', isBot: true }),
      );
      const expected = expect.objectContaining({
        status: HttpStatus.CONFLICT,
        code: 'EMAIL_ALREADY_EXISTS',
        fields: expect.objectContaining({
          email: 'A user with this email already exists.',
        }),
      });
      const dto = {
        expectedUpdatedAt: LOADED_AT.toISOString(),
        email: 'taken@openplany.dev',
      };
      await expect(
        ctx.service.update('actor-kai', 'u-1', dto, 'req-1'),
      ).rejects.toThrow(expected);

      ctx.adminUsersRepo.failNextUpdateWithUniqueEmail = true;
      await expect(
        ctx.service.update(
          'actor-kai',
          'u-1',
          { ...dto, email: 'free@openplany.dev' },
          'req-2',
        ),
      ).rejects.toThrow(expected);
      expect(ctx.adminUsersRepo.updates).toEqual([]);
    });
  });

  describe('changePassword', () => {
    const passwordDto = { password: 'NewPassword123!' };

    it('rejects changing own password before hashing or locking (RQ INV-10, AC-18)', async () => {
      const ctx = setup();
      await expect(
        ctx.service.changePassword(
          'actor-kai',
          'actor-kai',
          passwordDto,
          'req-1',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: 'CANNOT_CHANGE_OWN_PASSWORD',
        }),
      );
      expect(ctx.hashMock).not.toHaveBeenCalled();
      expect(ctx.adminUsersRepo.locks).toBe(0);
    });

    it('writes the hash, clears the three password flags, revokes sessions, emits the event', async () => {
      const ctx = setup();
      withUsers(ctx, { isPasswordAutoset: true, isPasswordExpired: true });
      ctx.adminUsersRepo.liveSessions.set('u-1', 2);

      await ctx.service.changePassword(
        'actor-kai',
        'u-1',
        passwordDto,
        'req-1',
      );

      expect(ctx.adminUsersRepo.updates).toEqual([
        {
          userId: 'u-1',
          changes: {
            password: 'hash:NewPassword123!',
            isPasswordAutoset: false,
            isPasswordExpired: false,
            isPasswordResetRequired: false,
            updatedAt: ctx.clock.now(),
          },
        },
      ]);
      expect(ctx.passwordChangedEventMock).toHaveBeenCalledWith({
        userId: 'u-1',
        actorId: 'actor-kai',
        revokedSessionCount: 2,
        occurredAt: ctx.clock.now(),
        requestId: 'req-1',
      });
    });

    it('400 fields.password when it equals the locked target email in any case', async () => {
      const ctx = setup();
      withUsers(ctx);
      await expect(
        ctx.service.changePassword(
          'actor-kai',
          'u-1',
          { password: 'AN@OpenPlany.dev' },
          'req-1',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: 'VALIDATION_ERROR',
          fields: expect.objectContaining({
            password: "Password can't be the same as the email",
          }),
        }),
      );
      expect(ctx.adminUsersRepo.updates).toEqual([]);
    });

    describe('step-up re-authentication for an instance admin target (API B7)', () => {
      it('403 REAUTHENTICATION_REQUIRED without actorPassword; nothing written', async () => {
        const ctx = setup();
        withUsers(ctx, { isSuperuser: true });
        await expect(
          ctx.service.changePassword('actor-kai', 'u-1', passwordDto, 'req-1'),
        ).rejects.toThrow(
          expect.objectContaining({
            status: HttpStatus.FORBIDDEN,
            code: 'REAUTHENTICATION_REQUIRED',
            fields: { actorPassword: expect.any(String) },
          }),
        );
        expect(ctx.adminUsersRepo.updates).toEqual([]);
      });

      it('403 REAUTHENTICATION_FAILED for a wrong actorPassword, before locking', async () => {
        const ctx = setup();
        withUsers(ctx, { isSuperuser: true });
        await expect(
          ctx.service.changePassword(
            'actor-kai',
            'u-1',
            { ...passwordDto, actorPassword: 'wrong' },
            'req-1',
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            status: HttpStatus.FORBIDDEN,
            code: 'REAUTHENTICATION_FAILED',
            fields: { actorPassword: 'Your password is incorrect.' },
          }),
        );
        expect(ctx.adminUsersRepo.locks).toBe(0);
      });

      it('changes the password with the right actorPassword', async () => {
        const ctx = setup();
        const { user } = withUsers(ctx, { isSuperuser: true });
        await ctx.service.changePassword(
          'actor-kai',
          'u-1',
          { ...passwordDto, actorPassword: 'KaiSecret1!' },
          'req-1',
        );
        expect(user.password).toBe('hash:NewPassword123!');
      });

      it('403 REAUTHENTICATION_FAILED when the actor password changed between the check and the lock', async () => {
        const ctx = setup();
        const { actor } = withUsers(ctx, { isSuperuser: true });
        const lock = ctx.adminUsersRepo.withLockedActorAndTarget.bind(
          ctx.adminUsersRepo,
        );
        ctx.adminUsersRepo.withLockedActorAndTarget = (
          actorId,
          targetId,
          work,
        ) => {
          actor.password = 'hash:ChangedMeanwhile1!';
          return lock(actorId, targetId, work);
        };
        await expect(
          ctx.service.changePassword(
            'actor-kai',
            'u-1',
            { ...passwordDto, actorPassword: 'KaiSecret1!' },
            'req-1',
          ),
        ).rejects.toThrow(
          expect.objectContaining({ code: 'REAUTHENTICATION_FAILED' }),
        );
        expect(ctx.adminUsersRepo.updates).toEqual([]);
      });

      it(`429 after ${REAUTH_FAILURE_LIMIT} wrong passwords, counting only failures`, async () => {
        const ctx = setup();
        withUsers(ctx, { isSuperuser: true });
        const warnSpy = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => {});
        try {
          await ctx.service.changePassword(
            'actor-kai',
            'u-1',
            { ...passwordDto, actorPassword: 'KaiSecret1!' },
            'req-ok',
          );
          for (let i = 0; i < REAUTH_FAILURE_LIMIT; i++) {
            await expect(
              ctx.service.changePassword(
                'actor-kai',
                'u-1',
                { ...passwordDto, actorPassword: `wrong-${i}` },
                `req-${i}`,
              ),
            ).rejects.toThrow(
              expect.objectContaining({ code: 'REAUTHENTICATION_FAILED' }),
            );
          }
          await expect(
            ctx.service.changePassword(
              'actor-kai',
              'u-1',
              { ...passwordDto, actorPassword: 'KaiSecret1!' },
              'req-blocked',
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              status: HttpStatus.TOO_MANY_REQUESTS,
              code: 'TOO_MANY_REAUTH_ATTEMPTS',
              message: 'Too many incorrect passwords. Try again in 15 minutes.',
              retryAfterSeconds: 900,
            }),
          );
          const logs = warnSpy.mock.calls.map(([line]) => String(line));
          expect(
            logs.filter((l) => l.startsWith('admin.users.reauth_failed')),
          ).toHaveLength(REAUTH_FAILURE_LIMIT);
          expect(logs).toContain(
            'admin.users.rate_limited limiter=reauth userId=actor-kai requestId=req-blocked',
          );
          for (const line of logs) expect(line).not.toContain('KaiSecret1!');
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('checks actorPassword whenever it is sent, even for a non-admin target', async () => {
        const ctx = setup();
        withUsers(ctx);
        await expect(
          ctx.service.changePassword(
            'actor-kai',
            'u-1',
            { ...passwordDto, actorPassword: 'wrong' },
            'req-1',
          ),
        ).rejects.toThrow(
          expect.objectContaining({ code: 'REAUTHENTICATION_FAILED' }),
        );
      });
    });

    it('tolerates event emission failure without throwing', async () => {
      const ctx = setup();
      withUsers(ctx);
      ctx.passwordChangedEventMock.mockRejectedValueOnce(
        new Error('Event bus down'),
      );

      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      try {
        await expect(
          ctx.service.changePassword('actor-kai', 'u-1', passwordDto, 'req-1'),
        ).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
