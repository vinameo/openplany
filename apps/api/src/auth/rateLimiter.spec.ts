import {
  FakeClock,
  FakeLoginAttemptsRepository,
  NOW,
} from '../../test/fakes/authFakes.js';
import { DbLoginRateLimiter } from './rateLimiter.js';

const MINUTE = 60 * 1000;
const IP = '203.0.113.7';
const EMAIL = 'email-hash';

function setup() {
  const attempts = new FakeLoginAttemptsRepository();
  const clock = new FakeClock();
  return { limiter: new DbLoginRateLimiter(attempts, clock), attempts, clock };
}

function addFailures(
  attempts: FakeLoginAttemptsRepository,
  count: number,
  { ip = IP, emailHash = EMAIL, minutesAgo = 1 } = {},
): void {
  for (let i = 0; i < count; i += 1) {
    attempts.failures.push({
      ip,
      emailHash,
      createdAt: new Date(NOW.getTime() - minutesAgo * MINUTE),
    });
  }
}

function reserve(
  limiter: DbLoginRateLimiter,
  { ip = IP, emailHash = EMAIL } = {},
) {
  return limiter.reserve({ ip, emailHash, userAgent: 'vitest' });
}

describe('DbLoginRateLimiter', () => {
  describe('reserve', () => {
    it('allows a clean key without delay', async () => {
      const { limiter } = setup();

      expect(await reserve(limiter)).toEqual({
        blocked: false,
        delayMs: 0,
        attemptId: 'attempt-1',
      });
    });

    it('allows 4 failures for the same email and IP', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 4);

      expect((await reserve(limiter)).blocked).toBe(false);
    });

    it('blocks the 6th try after 5 failures for the same email and IP', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { minutesAgo: 3 });

      expect(await reserve(limiter)).toEqual({
        blocked: true,
        retryAfterSeconds: 12 * 60,
      });
    });

    it('does not lock the email for other IPs', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { ip: '198.51.100.1' });

      expect((await reserve(limiter)).blocked).toBe(false);
    });

    it('blocks an IP after 50 failures across emails', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 50; i += 1) {
        addFailures(attempts, 1, { emailHash: `email-${i}` });
      }

      const decision = await reserve(limiter, { emailHash: 'fresh' });
      expect(decision.blocked).toBe(true);
    });

    it('ignores failures that left the 15-minute window', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { minutesAgo: 16 });

      expect((await reserve(limiter)).blocked).toBe(false);
    });

    it('slows down instead of locking after 20 failures for an email across IPs', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 21; i += 1) {
        addFailures(attempts, 1, { ip: `198.51.100.${i}` });
      }

      expect(await reserve(limiter)).toMatchObject({
        blocked: false,
        delayMs: 2000,
      });
    });

    it('caps the slowdown at 5 seconds', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 40; i += 1) {
        addFailures(attempts, 1, { ip: `198.51.100.${i}` });
      }

      expect(await reserve(limiter)).toMatchObject({
        blocked: false,
        delayMs: 5000,
      });
    });

    it('records an allowed try as a provisional failure under the IP lock', async () => {
      const { limiter, attempts } = setup();

      await reserve(limiter);

      expect(attempts.lockedIps).toEqual([IP]);
      expect(attempts.inserted).toEqual([
        {
          id: 'attempt-1',
          ip: IP,
          emailHash: EMAIL,
          userAgent: 'vitest',
          userId: null,
          result: 'failure',
          reason: null,
        },
      ]);
    });

    it('records a blocked try as a blocked row that does not count', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5);

      await reserve(limiter);
      await reserve(limiter);

      expect(attempts.inserted.map((row) => row.result)).toEqual([
        'blocked',
        'blocked',
      ]);
      expect(attempts.failures).toHaveLength(5);
    });

    it('counts reserved tries that have not finished, so parallel sign-ins cannot exceed the limit', async () => {
      const { limiter } = setup();

      const decisions = [];
      for (let i = 0; i < 7; i += 1) {
        decisions.push(await reserve(limiter));
      }

      expect(decisions.map((d) => d.blocked)).toEqual([
        false,
        false,
        false,
        false,
        false,
        true,
        true,
      ]);
    });
  });
});
