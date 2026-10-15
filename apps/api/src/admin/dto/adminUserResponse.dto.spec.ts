import { describe, expect, it } from 'vitest';
import {
  type AdminUserSourceRow,
  toAdminUserResponse,
} from './adminUserResponse.dto.js';

describe('toAdminUserResponse (API B4, RQ INV-12)', () => {
  it('maps all fields correctly when all values are populated', () => {
    const row: AdminUserSourceRow = {
      id: '01912f2c-e3a4-7123-8abc-0123456789ab',
      email: 'an@openplany.dev',
      firstName: 'An',
      lastName: 'Nguyen',
      displayName: 'An Nguyen',
      avatar: 'https://cdn.openplany.dev/avatars/an.png',
      isActive: true,
      isSuperuser: true,
      createdAt: new Date('2026-10-09T10:00:00.123Z'),
      updatedAt: new Date('2026-10-10T12:30:45.678Z'),
    };

    const response = toAdminUserResponse(row);

    expect(response).toEqual({
      id: '01912f2c-e3a4-7123-8abc-0123456789ab',
      email: 'an@openplany.dev',
      firstName: 'An',
      lastName: 'Nguyen',
      displayName: 'An Nguyen',
      avatarUrl: 'https://cdn.openplany.dev/avatars/an.png',
      isActive: true,
      isInstanceAdmin: true,
      createdAt: '2026-10-09T10:00:00.123Z',
      updatedAt: '2026-10-10T12:30:45.678Z',
    });
  });

  it('converts null email, firstName, lastName, displayName to empty string, and avatar to null', () => {
    const row: AdminUserSourceRow = {
      id: '01912f2c-e3a4-7123-8abc-0123456789ab',
      email: null,
      firstName: null,
      lastName: null,
      displayName: null,
      avatar: null,
      isActive: false,
      isSuperuser: false,
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
      updatedAt: new Date('2026-10-09T10:00:00.000Z'),
    };

    const response = toAdminUserResponse(row);

    expect(response).toEqual({
      id: '01912f2c-e3a4-7123-8abc-0123456789ab',
      email: '',
      firstName: '',
      lastName: '',
      displayName: '',
      avatarUrl: null,
      isActive: false,
      isInstanceAdmin: false,
      createdAt: '2026-10-09T10:00:00.000Z',
      updatedAt: '2026-10-09T10:00:00.000Z',
    });
  });
});
