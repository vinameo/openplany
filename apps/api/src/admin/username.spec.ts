import { describe, expect, it } from 'vitest';
import { generateUsername } from './username.js';

describe('generateUsername', () => {
  it('generates a 32-character lowercase hex string matching ^[0-9a-f]{32}$', () => {
    const username = generateUsername();
    expect(username).toMatch(/^[0-9a-f]{32}$/);
    expect(username.length).toBe(32);
  });

  it('generates distinct values across calls', () => {
    const first = generateUsername();
    const second = generateUsername();
    expect(first).not.toBe(second);
  });
});

