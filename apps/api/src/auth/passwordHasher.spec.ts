import { Argon2PasswordHasher } from './passwordHasher.js';

// Generated independently with Python:
// hashlib.pbkdf2_hmac('sha256', 'lètmein'.encode(), b'seasalt', 260000)
const DJANGO_HASH =
  'pbkdf2_sha256$260000$seasalt$YlZ2Vggtqdc61YjArZuoApoBh9JNGYoDRBUGu6tcJQo=';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  describe('hash', () => {
    it('produces an argon2id PHC string with OWASP parameters', async () => {
      const hash = await hasher.hash('Secret123!');

      expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[^$]+\$[^$]+$/);
    });

    it('salts every hash', async () => {
      expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
    });
  });

  describe('verify', () => {
    it('accepts the right password for its own hash', async () => {
      const hash = await hasher.hash('Secret123!');

      expect(await hasher.verify(hash, 'Secret123!')).toEqual({
        ok: true,
        needsRehash: false,
      });
    });

    it('rejects a wrong password', async () => {
      const hash = await hasher.hash('Secret123!');

      expect((await hasher.verify(hash, 'secret123!')).ok).toBe(false);
    });

    it('verifies a Django pbkdf2_sha256 hash and asks for a rehash', async () => {
      expect(await hasher.verify(DJANGO_HASH, 'lètmein')).toEqual({
        ok: true,
        needsRehash: true,
      });
      expect((await hasher.verify(DJANGO_HASH, 'letmein')).ok).toBe(false);
    });

    it('asks to rehash argon2id hashes weaker than the current parameters', async () => {
      const strong = await hasher.hash('Secret123!');
      const weak = strong.replace('m=19456,t=2', 'm=4096,t=1');
      // Re-derive with the weak parameters so the tag matches them.
      const { argon2Sync } = await import('node:crypto');
      const [, , , , salt] = weak.split('$');
      const tag = argon2Sync('argon2id', {
        message: 'Secret123!',
        nonce: Buffer.from(salt, 'base64'),
        memory: 4096,
        passes: 1,
        parallelism: 1,
        tagLength: 32,
      })
        .toString('base64')
        .replace(/=+$/, '');
      const weakHash = `${weak.slice(0, weak.lastIndexOf('$'))}$${tag}`;

      expect(await hasher.verify(weakHash, 'Secret123!')).toEqual({
        ok: true,
        needsRehash: true,
      });
    });

    it.each([
      ['an unknown format', 'md5$abc'],
      ['an empty hash', ''],
      [
        'absurd argon2 memory',
        '$argon2id$v=19$m=99999999,t=2,p=1$c2FsdHNhbHQ$dGFn',
      ],
      ['absurd pbkdf2 iterations', 'pbkdf2_sha256$999999999$salt$aGFzaA=='],
    ])('rejects %s without throwing', async (_label, stored) => {
      expect(await hasher.verify(stored, 'anything')).toEqual({
        ok: false,
        needsRehash: false,
      });
    });
  });
});
