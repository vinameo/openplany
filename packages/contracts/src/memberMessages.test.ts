import { describe, expect, it } from 'vitest';
import {
  MEMBER_CANDIDATE_QUERY_ALLOWED,
  MEMBER_MESSAGES,
  looksLikeFullEmail,
  truncatedMembersMessage,
} from './memberMessages.js';

describe('memberMessages', () => {
  describe('truncatedMembersMessage', () => {
    it('formats shown and total numbers with thousands separator', () => {
      expect(truncatedMembersMessage(1000, 1234)).toBe(
        'Showing the first 1,000 of 1,234 members.',
      );
      expect(truncatedMembersMessage(10, 20)).toBe(
        'Showing the first 10 of 20 members.',
      );
    });
  });

  describe('MEMBER_CANDIDATE_QUERY_ALLOWED', () => {
    it('accepts valid email search patterns including accented characters and plus sign', () => {
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('an@openplany.dev')).toBe(true);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('user+tag@domain.com')).toBe(true);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('người@dùng.vn')).toBe(true);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('admin@localhost')).toBe(true);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('simple-text_123')).toBe(true);
    });

    it('rejects control characters such as NUL and BEL', () => {
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('an\u0000b')).toBe(false);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('an\u0007b')).toBe(false);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('test\nemail')).toBe(false);
      expect(MEMBER_CANDIDATE_QUERY_ALLOWED.test('test\remail')).toBe(false);
    });
  });

  describe('looksLikeFullEmail', () => {
    it('returns true for admin@localhost', () => {
      expect(looksLikeFullEmail('admin@localhost')).toBe(true);
    });

    it('returns false for incomplete email like an@', () => {
      expect(looksLikeFullEmail('an@')).toBe(false);
      expect(looksLikeFullEmail('an')).toBe(false);
      expect(looksLikeFullEmail('@openplany.dev')).toBe(false);
    });

    it('handles unicode, plus signs, and whitespace correctly', () => {
      expect(looksLikeFullEmail('an+team@openplany.dev')).toBe(true);
      expect(looksLikeFullEmail('người@miền.vn')).toBe(true);
      expect(looksLikeFullEmail('  an@openplany.dev  ')).toBe(true);
      expect(looksLikeFullEmail('an @openplany.dev')).toBe(false);
      expect(looksLikeFullEmail('an@ openplany.dev')).toBe(false);
    });

    it('rejects control characters', () => {
      expect(looksLikeFullEmail('an\u0000@openplany.dev')).toBe(false);
      expect(looksLikeFullEmail('an\u0007@openplany.dev')).toBe(false);
    });
  });

  describe('MEMBER_MESSAGES', () => {
    it('contains all required message strings', () => {
      expect(MEMBER_MESSAGES.rowDuplicate).toBe('This person is already in another row');
      expect(MEMBER_MESSAGES.candidateQueryTooShort).toBe('Type at least 3 characters');
      expect(MEMBER_MESSAGES.candidateQueryInvalid).toBe('Remove special characters from the email');
      expect(MEMBER_MESSAGES.choosePerson).toBe('Choose a person');
      expect(MEMBER_MESSAGES.chooseRole).toBe('Choose a role');
      expect(MEMBER_MESSAGES.addAtLeastOne).toBe('Add at least one person');
      expect(MEMBER_MESSAGES.addAtMost).toBe('Add up to 20 people at a time');
      expect(MEMBER_MESSAGES.checkFields).toBe('Check the highlighted fields');
      expect(MEMBER_MESSAGES.notAllowed).toBe("You don't have permission to do this");
      expect(MEMBER_MESSAGES.roleNotAllowed).toBe("You can't assign this role");
      expect(MEMBER_MESSAGES.someNotAdded).toBe("Some people couldn't be added");
      expect(MEMBER_MESSAGES.tooManySearches).toBe('Too many searches. Try again later.');
    });
  });
});
