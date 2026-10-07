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

describe('DbLoginRateLimiter', () => {
  describe('check', () => {
    it('allows a clean key without delay', async () => {
      const { limiter } = setup();

      expect(await limiter.check({ ip: IP, emailHash: EMAIL })).toEqual({
        blocked: false,
        delayMs: 0,
      });
    });

    it('allows 4 failures for the same email and IP', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 4);

      expect((await limiter.check({ ip: IP, emailHash: EMAIL })).blocked).toBe(
        false,
      );
    });

    it('blocks the 6th try after 5 failures for the same email and IP', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { minutesAgo: 3 });

      expect(await limiter.check({ ip: IP, emailHash: EMAIL })).toEqual({
        blocked: true,
        retryAfterSeconds: 12 * 60,
      });
    });

    it('does not lock the email for other IPs', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { ip: '198.51.100.1' });

      expect((await limiter.check({ ip: IP, emailHash: EMAIL })).blocked).toBe(
        false,
      );
    });

    it('blocks an IP after 50 failures across emails', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 50; i += 1) {
        addFailures(attempts, 1, { emailHash: `email-${i}` });
      }

      const decision = await limiter.check({ ip: IP, emailHash: 'fresh' });
      expect(decision.blocked).toBe(true);
    });

    it('ignores failures that left the 15-minute window', async () => {
      const { limiter, attempts } = setup();
      addFailures(attempts, 5, { minutesAgo: 16 });

      expect((await limiter.check({ ip: IP, emailHash: EMAIL })).blocked).toBe(
        false,
      );
    });

    it('slows down instead of locking after 20 failures for an email across IPs', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 21; i += 1) {
        addFailures(attempts, 1, { ip: `198.51.100.${i}` });
      }

      expect(await limiter.check({ ip: IP, emailHash: EMAIL })).toEqual({
        blocked: false,
        delayMs: 2000,
      });
    });

    it('caps the slowdown at 5 seconds', async () => {
      const { limiter, attempts } = setup();
      for (let i = 0; i < 40; i += 1) {
        addFailures(attempts, 1, { ip: `198.51.100.${i}` });
      }

      expect(await limiter.check({ ip: IP, emailHash: EMAIL })).toEqual({
        blocked: false,
        delayMs: 5000,
      });
    });
  });
});
