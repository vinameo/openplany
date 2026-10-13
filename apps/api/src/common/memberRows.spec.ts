import { describe, expect, it } from 'vitest';
import type { TransformFnParams } from 'class-transformer';
import { MEMBER_MESSAGES } from '@repo/contracts';
import {
  duplicateMemberRowFields,
  toCanonicalUserId,
} from './memberRows.js';

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

describe('toCanonicalUserId', () => {
  it('lowercases string ids so they match the ids Postgres returns', () => {
    expect(
      toCanonicalUserId({
        value: 'A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D',
      } as TransformFnParams),
    ).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  });

  it('leaves non-string values for the validator to reject', () => {
    expect(toCanonicalUserId({ value: 42 } as TransformFnParams)).toBe(42);
    expect(toCanonicalUserId({ value: null } as TransformFnParams)).toBeNull();
  });
});
