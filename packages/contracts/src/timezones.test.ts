import { describe, expect, it } from 'vitest';
import { WORKSPACE_TIMEZONES, WORKSPACE_TIMEZONE_SET } from './timezones.js';

describe('timezones', () => {
  it('contains UTC, Asia/Ho_Chi_Minh, and Europe/Oslo', () => {
    expect(WORKSPACE_TIMEZONE_SET.has('UTC')).toBe(true);
    expect(WORKSPACE_TIMEZONE_SET.has('Asia/Ho_Chi_Minh')).toBe(true);
    expect(WORKSPACE_TIMEZONE_SET.has('Europe/Oslo')).toBe(true);
  });

  it('does NOT contain obsolete aliases like Asia/Saigon', () => {
    expect(WORKSPACE_TIMEZONE_SET.has('Asia/Saigon')).toBe(false);
  });

  it('contains no duplicate entries', () => {
    expect(WORKSPACE_TIMEZONES.length).toBe(WORKSPACE_TIMEZONE_SET.size);
  });

  it('has UTC as the first entry and the rest are sorted alphabetically', () => {
    expect(WORKSPACE_TIMEZONES[0]).toBe('UTC');

    const rest = WORKSPACE_TIMEZONES.slice(1);
    const sortedRest = [...rest].sort((a, b) => a.localeCompare(b));
    expect(rest).toEqual(sortedRest);
  });

  it('ensures every timezone is valid according to Intl.DateTimeFormat', () => {
    for (const tz of WORKSPACE_TIMEZONES) {
      expect(() => {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
      }).not.toThrow();
    }
  });
});

