import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { FakeUsersRepository, makeUser } from '../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { PasswordConfirmation } from './passwordConfirmation.js';
import type { PasswordHasher, PasswordVerification } from './passwordHasher.js';

class SlowFakeHasher implements PasswordHasher {
  verifyCalls = 0;
  delayMs = 0;
  verifyOk = true;

  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verify(
    storedHash: string,
    password: string,
  ): Promise<PasswordVerification> {
    this.verifyCalls++;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return {
      ok: this.verifyOk && storedHash === `hash:${password}`,
      needsRehash: false,
    };
  }
}

describe('PasswordConfirmation', () => {
  const setup = (options?: { limit?: number; windowMs?: number }) => {
    const clock = new FakeClock(new Date('2026-10-20T12:00:00.000Z'));
    const users = new FakeUsersRepository();
    const hasher = new SlowFakeHasher();
    const limiter = new InMemorySlidingWindowLimiter({
      limit: options?.limit ?? 5,
      windowMs: options?.windowMs ?? 15 * 60 * 1000,
    });
    const loggedIncorrect: { userId: string; requestId: string }[] = [];
    const loggedBlocked: { userId: string; requestId: string }[] = [];

    const confirmation = new PasswordConfirmation(
      {
        limiter,
        incorrect: {
          status: HttpStatus.FORBIDDEN,
          code: 'REAUTHENTICATION_FAILED',
          message: { key: 'admin:users.errors.reauthenticationFailed' },
          field: 'actorPassword',
        },
        blocked: {
          code: 'TOO_MANY_REAUTH_ATTEMPTS',
          messageKey: 'admin:users.errors.tooManyReauthAttempts',
        },
        log: {
          incorrect: (info) => {
            loggedIncorrect.push(info);
            return `admin.users.reauth_failed userId=${info.userId} requestId=${info.requestId}`;
          },
          blocked: (info) => {
            loggedBlocked.push(info);
            return `admin.users.rate_limited limiter=reauth userId=${info.userId} requestId=${info.requestId}`;
          },
        },
      },
      users,
      hasher,
      clock,
    );

    return {
      clock,
      users,
      hasher,
      limiter,
      confirmation,
      loggedIncorrect,
      loggedBlocked,
    };
  };

  it('reserves slot upfront and releases on correct password', async () => {
    const { users, hasher, limiter, confirmation, clock } = setup();
    const user = makeUser({ id: 'u1', password: 'hash:secret' });
    users.users.push(user);

    const result = await confirmation.confirm('u1', 'secret', 'req-1');
    expect(result).toEqual({ status: 'ok', verifiedHash: 'hash:secret' });
    expect(hasher.verifyCalls).toBe(1);

    // Slot was released, so quota is full
    expect(limiter.peek('u1', clock.now()).allowed).toBe(true);
  });

  it('releases slot on no-user', async () => {
    const { confirmation, limiter, clock, hasher } = setup();
    const result = await confirmation.confirm(
      'non-existent',
      'secret',
      'req-1',
    );
    expect(result).toEqual({ status: 'no-user' });
    expect(hasher.verifyCalls).toBe(0);
    expect(limiter.peek('non-existent', clock.now()).allowed).toBe(true);
  });

  it('releases slot when stillSignedIn returns false', async () => {
    const { users, confirmation, limiter, clock } = setup();
    users.users.push(makeUser({ id: 'u1', password: 'hash:secret' }));

    const result = await confirmation.confirm('u1', 'wrong', 'req-1', {
      stillSignedIn: () => Promise.resolve(false),
    });
    expect(result).toEqual({ status: 'not-signed-in' });
    expect(limiter.peek('u1', clock.now()).allowed).toBe(true);
  });

  it('keeps slot and throws on incorrect password when still signed in', async () => {
    const { users, confirmation, limiter, clock, loggedIncorrect } = setup();
    users.users.push(makeUser({ id: 'u1', password: 'hash:secret' }));

    await expect(
      confirmation.confirm('u1', 'wrong', 'req-1'),
    ).rejects.toThrow();

    expect(loggedIncorrect).toEqual([{ userId: 'u1', requestId: 'req-1' }]);
    // 1 hit recorded
    expect(limiter.peek('u1', clock.now()).allowed).toBe(true);

    // Exhaust limit (5 attempts)
    for (let i = 2; i <= 5; i++) {
      await expect(
        confirmation.confirm('u1', 'wrong', `req-${i}`),
      ).rejects.toThrow();
    }

    // 6th attempt is blocked, even with correct password
    const err = await confirmation
      .confirm('u1', 'secret', 'req-6')
      .catch((e) => e);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.code).toBe('TOO_MANY_REAUTH_ATTEMPTS');
  });

  it('releases slot on unexpected hasher exception via try/finally', async () => {
    const { users, hasher, confirmation, limiter, clock } = setup();
    users.users.push(makeUser({ id: 'u1', password: 'hash:secret' }));
    hasher.verify = () => Promise.reject(new Error('Hasher crashed'));

    await expect(confirmation.confirm('u1', 'secret', 'req-1')).rejects.toThrow(
      'Hasher crashed',
    );

    // Slot was released
    expect(limiter.peek('u1', clock.now()).allowed).toBe(true);
  });

  it('limits parallel incorrect requests so at most limit attempts verify (AC-32)', async () => {
    const { users, hasher, confirmation } = setup({ limit: 5 });
    users.users.push(makeUser({ id: 'u1', password: 'hash:secret' }));
    hasher.delayMs = 20;

    // Send 8 parallel wrong-password requests
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        confirmation.confirm('u1', 'wrong', `req-${i}`),
      ),
    );

    const rejections = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(rejections).toHaveLength(8);

    const forbidden = rejections.filter(
      (r) => r.reason.getStatus?.() === HttpStatus.FORBIDDEN,
    );
    const tooMany = rejections.filter(
      (r) => r.reason.getStatus?.() === HttpStatus.TOO_MANY_REQUESTS,
    );

    expect(forbidden.length).toBeLessThanOrEqual(5);
    expect(forbidden.length + tooMany.length).toBe(8);
    expect(tooMany.length).toBeGreaterThanOrEqual(3);
    expect(hasher.verifyCalls).toBeLessThanOrEqual(5);
  });
});
