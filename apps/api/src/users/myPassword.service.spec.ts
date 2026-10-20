import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from '../common/apiException.js';
import {
  FakeClock,
  FakePasswordHasher,
  FakeSessionsRepository,
  FakeLockedUsersRepository,
  makeSession,
  makeUser,
  NOW,
} from '../../test/fakes/authFakes.js';
import { hashSessionToken } from '../auth/authTokens.js';
import type {
  ConfirmationResult,
  PasswordConfirmation,
} from '../auth/passwordConfirmation.js';
import { SessionIssuer } from '../auth/sessionIssuer.js';
import { UserEvents } from './events/userEvents.js';
import { ChangeMyPasswordDto } from './dto/changeMyPassword.dto.js';
import { MyPasswordService } from './myPassword.service.js';

function makeDto(
  currentPassword: string,
  newPassword: string,
): ChangeMyPasswordDto {
  const dto = new ChangeMyPasswordDto();
  dto.currentPassword = currentPassword;
  dto.newPassword = newPassword;
  return dto;
}

const CONTEXT = {
  requestId: 'req-123',
  ip: '127.0.0.1',
  userAgent: 'TestAgent/1.0',
};

describe('MyPasswordService (DB B3)', () => {
  function setup(
    options: {
      initialUserPassword?: string;
      isUserActive?: boolean;
      maskedAt?: Date | null;
      confirmationResult?: ConfirmationResult;
      confirmationError?: unknown;
      hasLiveSession?: boolean;
      sessionUserId?: string;
    } = {},
  ) {
    const user = makeUser({
      id: 'user-1',
      email: 'an@openplany.dev',
      password: options.initialUserPassword ?? 'hash:OldPassword123!',
      isActive: options.isUserActive ?? true,
      maskedAt: options.maskedAt ?? null,
      isPasswordResetRequired: true,
      isPasswordAutoset: true,
      isPasswordExpired: true,
    });

    const clock = new FakeClock(NOW);
    const hasher = new FakePasswordHasher();
    const lockedUsers = new FakeLockedUsersRepository();
    lockedUsers.users.push(user);

    const rawToken = 'current-session-token';
    const currentTokenHash = hashSessionToken(rawToken);

    if (options.hasLiveSession ?? true) {
      const session = makeSession({
        userId: options.sessionUserId ?? user.id,
        tokenHash: currentTokenHash,
        expiresAt: new Date(NOW.getTime() + 3600_000),
        revokedAt: null,
      });
      lockedUsers.sessions.push(session);
    }

    const sessions = new FakeSessionsRepository();
    if (options.hasLiveSession ?? true) {
      sessions.active = {
        session: lockedUsers.sessions[0]!,
        user,
      };
    } else {
      sessions.active = null;
    }

    const confirmationConfirm = vi.fn().mockImplementation(async () => {
      if (options.confirmationError) {
        throw options.confirmationError;
      }
      return (
        options.confirmationResult ?? {
          status: 'ok',
          verifiedHash: user.password,
        }
      );
    });

    const confirmation = {
      confirm: confirmationConfirm,
    } as unknown as PasswordConfirmation;

    const config = new ConfigService({
      SESSION_TTL_DAYS: 7,
    });
    const sessionIssuer = new SessionIssuer(config);

    const passwordChangedMock = vi.fn().mockResolvedValue(undefined);
    const events = {
      created: vi.fn(),
      updated: vi.fn(),
      passwordChanged: passwordChangedMock,
    } as unknown as UserEvents;

    const service = new MyPasswordService(
      confirmation,
      hasher,
      clock,
      lockedUsers,
      sessionIssuer,
      sessions,
      events,
    );

    return {
      service,
      user,
      rawToken,
      currentTokenHash,
      confirmation,
      confirmationConfirm,
      hasher,
      lockedUsers,
      sessions,
      events,
      passwordChangedMock,
    };
  }

  it('Step 1: throws VALIDATION_ERROR when newPassword === currentPassword without hashing or confirming (AC-08)', async () => {
    const { service, confirmationConfirm, hasher, rawToken } = setup();

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('SamePassword123!', 'SamePassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.fieldErrors).toEqual({
        newPassword: { key: 'users:errors.passwordSameAsCurrent' },
      });
    });

    expect(confirmationConfirm).not.toHaveBeenCalled();
    const hashSpy = vi.spyOn(hasher, 'hash');
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it('Step 2.1: propagates rate limit exception when limiter blocked', async () => {
    const rateLimitError = new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_PASSWORD_ATTEMPTS',
      { key: 'users:errors.tooManyPasswordAttempts', params: { count: 15 } },
    );
    const { service, rawToken } = setup({ confirmationError: rateLimitError });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(rateLimitError);
  });

  it('Step 2.2: throws UNAUTHENTICATED when confirmation returns no-user (AC-14)', async () => {
    const { service, rawToken, lockedUsers, passwordChangedMock } = setup({
      confirmationResult: { status: 'no-user' },
    });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(err.code).toBe('UNAUTHENTICATED');
    });

    expect(lockedUsers.lockedCalls).toHaveLength(0);
    expect(passwordChangedMock).not.toHaveBeenCalled();
  });

  it('Step 2.4: throws UNAUTHENTICATED when confirmation returns not-signed-in (AC-12)', async () => {
    const { service, rawToken, lockedUsers, passwordChangedMock } = setup({
      confirmationResult: { status: 'not-signed-in' },
    });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('WrongPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(err.code).toBe('UNAUTHENTICATED');
    });

    expect(lockedUsers.lockedCalls).toHaveLength(0);
    expect(passwordChangedMock).not.toHaveBeenCalled();
  });

  it('Step 2.4: propagates CURRENT_PASSWORD_INCORRECT when wrong password and still signed in', async () => {
    const incorrectError = new ApiException(
      HttpStatus.BAD_REQUEST,
      'CURRENT_PASSWORD_INCORRECT',
      { key: 'users:errors.currentPasswordIncorrect' },
      {
        fields: {
          currentPassword: { key: 'users:errors.currentPasswordIncorrect' },
        },
      },
    );
    const { service, rawToken } = setup({ confirmationError: incorrectError });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('WrongPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(incorrectError);
  });

  it('Step 6: throws UNAUTHENTICATED when locked user is inactive (AC-14)', async () => {
    const { service, rawToken, lockedUsers, passwordChangedMock } = setup({
      isUserActive: false,
    });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(err.code).toBe('UNAUTHENTICATED');
    });

    expect(passwordChangedMock).not.toHaveBeenCalled();
    expect(lockedUsers.sessions).toHaveLength(1);
    expect(lockedUsers.sessions[0]!.revokedAt).toBeNull();
  });

  it('Step 7: throws UNAUTHENTICATED when current session is missing or revoked (AC-12)', async () => {
    const { service, rawToken, passwordChangedMock } = setup({
      hasLiveSession: false,
    });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(err.code).toBe('UNAUTHENTICATED');
    });

    expect(passwordChangedMock).not.toHaveBeenCalled();
  });

  it('Step 8: retries once when hash changed concurrently, then succeeds if second attempt matches (AC-29)', async () => {
    const {
      service,
      user,
      rawToken,
      confirmationConfirm,
      passwordChangedMock,
    } = setup({
      initialUserPassword: 'hash:OldPassword123!',
    });

    // On first confirm call, verifiedHash is 'hash:OldPassword123!'
    // But row in lockedUsers is changed to 'hash:RehashedPassword123!'
    user.password = 'hash:RehashedPassword123!';

    let callCount = 0;
    confirmationConfirm.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { status: 'ok', verifiedHash: 'hash:OldPassword123!' };
      }
      return { status: 'ok', verifiedHash: 'hash:RehashedPassword123!' };
    });

    const result = await service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    expect(confirmationConfirm).toHaveBeenCalledTimes(2);
    expect(result.body.user.id).toBe('user-1');
    expect(result.body.requiresPasswordReset).toBe(false);
    expect(passwordChangedMock).toHaveBeenCalledTimes(1);
  });

  it('Step 8: throws 409 PASSWORD_CHANGED_ELSEWHERE when hash still differs on second attempt', async () => {
    const {
      service,
      user,
      rawToken,
      confirmationConfirm,
      passwordChangedMock,
    } = setup({
      initialUserPassword: 'hash:OldPassword123!',
    });

    user.password = 'hash:DifferentHash1!';

    confirmationConfirm.mockImplementation(async () => {
      return { status: 'ok', verifiedHash: 'hash:StaleHash!' };
    });

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'NewPassword123!'),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(err.code).toBe('PASSWORD_CHANGED_ELSEWHERE');
      expect(err.messageRef).toEqual({
        key: 'users:errors.passwordChangedElsewhere',
      });
    });

    expect(confirmationConfirm).toHaveBeenCalledTimes(2);
    expect(passwordChangedMock).not.toHaveBeenCalled();
  });

  it('Step 9: throws VALIDATION_ERROR when newPassword equals user email (AC-08)', async () => {
    const { service, rawToken, user, passwordChangedMock } = setup();

    const promise = service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto(
        'OldPassword123!',
        (user.email ?? 'user@example.com').toUpperCase(),
      ),
      context: CONTEXT,
    });

    await expect(promise).rejects.toThrow(ApiException);
    await promise.catch((err: ApiException) => {
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.fieldErrors).toEqual({
        newPassword: { key: 'users:errors.passwordSameAsEmail' },
      });
    });

    expect(passwordChangedMock).not.toHaveBeenCalled();
  });

  it('Success: updates user, revokes existing sessions, inserts new session, logs event (AC-05, AC-24)', async () => {
    const { service, user, rawToken, lockedUsers, passwordChangedMock } =
      setup();

    const result = await service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'BrandNewSecret999!'),
      context: CONTEXT,
    });

    expect(result.token).toBeDefined();
    expect(result.maxAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(result.body.requiresPasswordReset).toBe(false);
    expect(result.body.user).toEqual({
      id: 'user-1',
      email: 'an@openplany.dev',
      displayName: 'An Nguyen',
      firstName: 'An',
      lastName: 'Nguyen',
      avatarUrl: null,
      timezone: 'Asia/Ho_Chi_Minh',
      isEmailVerified: true,
      isInstanceAdmin: false,
    });

    // Check updated user row in database
    expect(user.password).toBe('hash:BrandNewSecret999!');
    expect(user.isPasswordAutoset).toBe(false);
    expect(user.isPasswordExpired).toBe(false);
    expect(user.isPasswordResetRequired).toBe(false);
    expect(user.updatedAt).toEqual(NOW);

    // Old session revoked, new session inserted
    expect(lockedUsers.sessions).toHaveLength(2);
    expect(lockedUsers.sessions[0]!.revokedAt).toEqual(NOW);
    expect(lockedUsers.sessions[1]!.revokedAt).toBeNull();
    expect(lockedUsers.sessions[1]!.isResetOnly).toBe(false);

    // Event dispatched
    expect(passwordChangedMock).toHaveBeenCalledWith({
      userId: 'user-1',
      actorId: 'user-1',
      revokedSessionCount: 1,
      occurredAt: NOW,
      requestId: CONTEXT.requestId,
    });
  });

  it('Swallows event errors without failing password change', async () => {
    const { service, rawToken, passwordChangedMock } = setup();
    passwordChangedMock.mockRejectedValueOnce(
      new Error('Kafka/logging failure'),
    );

    const result = await service.change({
      userId: 'user-1',
      currentToken: rawToken,
      dto: makeDto('OldPassword123!', 'BrandNewSecret999!'),
      context: CONTEXT,
    });

    expect(result.body.requiresPasswordReset).toBe(false);
  });
});
