import { describe, expect, it } from 'vitest';
import {
  EMAIL_MAX,
  fullName,
  normalizeName,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
} from './user.js';

describe('user contracts and helpers', () => {
  describe('constants', () => {
    it('defines expected constants', () => {
      expect(USER_NAME_MAX).toBe(50);
      expect(EMAIL_MAX).toBe(254);
      expect(PASSWORD_MIN).toBe(8);
      expect(PASSWORD_MAX).toBe(128);
    });

    it('validates allowed characters with USER_NAME_ALLOWED', () => {
      expect(USER_NAME_ALLOWED.test('Kai Tran')).toBe(true);
      expect(USER_NAME_ALLOWED.test('Nguyễn Văn An')).toBe(true);
      expect(USER_NAME_ALLOWED.test('日本語')).toBe(true);

      // Control character (Cc)
      expect(USER_NAME_ALLOWED.test('Kai\u0000Tran')).toBe(false);
      expect(USER_NAME_ALLOWED.test('Kai\nTran')).toBe(false);

      // Invisible format character (Cf) - e.g., zero-width space \u200B, BOM \uFEFF
      expect(USER_NAME_ALLOWED.test('Kai\u200BTran')).toBe(false);
      expect(USER_NAME_ALLOWED.test('Kai\uFEFFTran')).toBe(false);
    });
  });

  describe('normalizeName', () => {
    it('composes decomposed Unicode into NFC and trims whitespace', () => {
      // Decomposed "Khái" -> "K" + "h" + "a" + "\u0301" + "i"
      const decomposed = 'Kha\u0301i';
      const normalized = normalizeName(`   ${decomposed}   `);
      expect(normalized).toBe('Khái');
      expect(normalized).toBe('Khái'.normalize('NFC'));
    });

    it('trims leading and trailing spaces', () => {
      expect(normalizeName('   Alex  ')).toBe('Alex');
    });
  });

  describe('fullName', () => {
    it('returns empty string when both names are empty', () => {
      expect(fullName('', '')).toBe('');
      expect(fullName('   ', '   ')).toBe('');
    });

    it('returns single name when one part is empty', () => {
      expect(fullName('Kai', '')).toBe('Kai');
      expect(fullName('', 'Tran')).toBe('Tran');
      expect(fullName('   Kai  ', '   ')).toBe('Kai');
    });

    it('joins first and last names with single space and handles Unicode', () => {
      expect(fullName('Kai', 'Tran')).toBe('Kai Tran');
      expect(fullName(' Nguyễn ', ' Văn An ')).toBe('Nguyễn Văn An');
    });
  });
});

