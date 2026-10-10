import { describe, expect, it } from 'vitest';
import { escapeLikePattern, normalizeForSearch } from './workspaceMembers.js';

describe('normalizeForSearch', () => {
  it('API-08: normalizes Vietnamese diacritics, lowercases, and trims while preserving spaces', () => {
    expect(normalizeForSearch('  Trần Đức ')).toBe('tran duc');
    expect(normalizeForSearch('Đặng Thị Ngọc Thịnh')).toBe('dang thi ngoc thinh');
    expect(normalizeForSearch('  ALICE@EXAMPLE.COM  ')).toBe('alice@example.com');
  });

  it('handles empty and whitespace strings', () => {
    expect(normalizeForSearch('')).toBe('');
    expect(normalizeForSearch('   ')).toBe('');
  });
});

describe('escapeLikePattern', () => {
  it('API-09: escapes %, _, and \\ with backslash', () => {
    expect(escapeLikePattern('a_%\\b')).toBe('a\\_\\%\\\\b');
  });

  it('preserves strings without special characters', () => {
    expect(escapeLikePattern('user@example.com')).toBe('user@example.com');
  });
});

