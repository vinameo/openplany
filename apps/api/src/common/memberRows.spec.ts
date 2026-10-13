import { describe, expect, it } from 'vitest';
import { MEMBER_MESSAGES } from '@repo/contracts';
import { duplicateMemberRowFields } from './memberRows.js';

describe('duplicateMemberRowFields', () => {
  it('returns empty object when no duplicates exist', () => {
    const members = [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }];
    expect(duplicateMemberRowFields(members)).toEqual({});
  });

  it('flags rows with duplicate userId starting from the second occurrence', () => {
    const members = [
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-1' },
      { userId: 'user-3' },
      { userId: 'user-1' },
    ];
    expect(duplicateMemberRowFields(members)).toEqual({
      'members.2.userId': MEMBER_MESSAGES.rowDuplicate,
      'members.4.userId': MEMBER_MESSAGES.rowDuplicate,
    });
  });

  it('handles empty array', () => {
    expect(duplicateMemberRowFields([])).toEqual({});
  });
});
