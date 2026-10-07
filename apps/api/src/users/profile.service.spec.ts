import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/apiException.js';
import {
  FakeClock,
  FakeUsersRepository,
  makeUser,
  NOW,
} from '../../test/fakes/authFakes.js';
import type { User } from '../auth/entities/user.entity.js';
import { UpdateProfileDto } from './dto/updateProfile.dto.js';
import { ProfileService } from './profile.service.js';

function setup(user: User | null = makeUser()) {
  const users = new FakeUsersRepository();
  if (user !== null) users.users.push(user);
  const service = new ProfileService(users, new FakeClock());
  return { service, users };
}

function dto(fields: Partial<UpdateProfileDto>): UpdateProfileDto {
  return Object.assign(new UpdateProfileDto(), fields);
}

async function expectApiError(
  promise: Promise<unknown>,
  status: HttpStatus,
  code: string,
): Promise<ApiException> {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiException);
  const apiError = error as ApiException;
  expect(apiError.getStatus()).toBe(status);
  expect(apiError.code).toBe(code);
  return apiError;
}

describe('ProfileService', () => {
  describe('getMe', () => {
    it('maps the user field by field', async () => {
      const { service } = setup();

      const me = await service.getMe('user-1');

      expect(me).toEqual({
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
    });

    it('throws UNAUTHENTICATED for a deactivated user', async () => {
      const { service } = setup(makeUser({ isActive: false }));

      await expectApiError(
        service.getMe('user-1'),
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
      );
    });
  });

  describe('updateMe', () => {
    it('rejects a body with no field (rule 1)', async () => {
      const { service, users } = setup();

      const error = await expectApiError(
        service.updateMe('user-1', dto({}), 'req-1'),
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
      );

      expect(error.message).toBe('Nothing to update');
      expect(users.profileUpdates).toHaveLength(0);
    });

    it('throws UNAUTHENTICATED when the user is gone (rule 2)', async () => {
      const { service } = setup(null);

      await expectApiError(
        service.updateMe('user-1', dto({ displayName: 'An' }), 'req-1'),
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
      );
    });

    it('rejects a display-name-only change when first name is empty (rule 3)', async () => {
      const { service, users } = setup(makeUser({ firstName: '' }));

      const error = await expectApiError(
        service.updateMe('user-1', dto({ displayName: 'Kai' }), 'req-1'),
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
      );

      expect(error.fields).toEqual({ firstName: 'Enter your first name' });
      expect(users.profileUpdates).toHaveLength(0);
    });

    it('treats a null first name like an empty one (rule 3)', async () => {
      const { service } = setup(makeUser({ firstName: null }));

      const error = await expectApiError(
        service.updateMe('user-1', dto({ lastName: 'Tran' }), 'req-1'),
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
      );

      expect(error.fields).toEqual({ firstName: 'Enter your first name' });
    });

    it('lets a user with no first name fix it together with the display name', async () => {
      const { service, users } = setup(makeUser({ firstName: '' }));

      const result = await service.updateMe(
        'user-1',
        dto({ firstName: 'Kai', displayName: 'kaitranpo' }),
        'req-1',
      );

      expect(result).toMatchObject({
        firstName: 'Kai',
        displayName: 'kaitranpo',
      });
      expect(users.profileUpdates[0].changes).toEqual({
        firstName: 'Kai',
        displayName: 'kaitranpo',
      });
    });

    it('writes only the fields that differ and stamps updated_at (rules 5, 7)', async () => {
      const { service, users } = setup();

      const result = await service.updateMe(
        'user-1',
        dto({ firstName: 'An', lastName: 'Tran' }),
        'req-1',
      );

      expect(users.profileUpdates).toEqual([
        { id: 'user-1', changes: { lastName: 'Tran' }, at: NOW },
      ]);
      expect(result.lastName).toBe('Tran');
    });

    it('does not write when nothing differs (rule 5)', async () => {
      const { service, users } = setup();

      const result = await service.updateMe(
        'user-1',
        dto({ firstName: 'An', displayName: 'An Nguyen' }),
        'req-1',
      );

      expect(users.profileUpdates).toHaveLength(0);
      expect(result.displayName).toBe('An Nguyen');
    });

    it('allows clearing the last name', async () => {
      const { service, users } = setup();

      await service.updateMe('user-1', dto({ lastName: '' }), 'req-1');

      expect(users.profileUpdates[0].changes).toEqual({ lastName: '' });
    });

    it('throws UNAUTHENTICATED when the account was locked mid-request (rule 6)', async () => {
      const { service, users } = setup();
      users.rejectProfileUpdates = true;

      await expectApiError(
        service.updateMe('user-1', dto({ displayName: 'Kai' }), 'req-1'),
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
      );
    });
  });
});
