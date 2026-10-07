import { Injectable } from '@nestjs/common';
import {
  argon2,
  pbkdf2,
  randomBytes,
  timingSafeEqual,
  type Argon2Parameters,
} from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);
const pbkdf2Async = promisify(pbkdf2);

export interface PasswordVerification {
  ok: boolean;
  /** The stored hash uses an outdated algorithm or parameters (R1). */
  needsRehash: boolean;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(
    storedHash: string,
    password: string,
  ): Promise<PasswordVerification>;
}

// OWASP minimum for argon2id (api-spec 6.1): m = 19 MiB, t = 2, p = 1.
const ARGON2_MEMORY_KIB = 19_456;
const ARGON2_PASSES = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;
const ARGON2_SALT_LENGTH = 16;
const ARGON2_VERSION = 19;

const ARGON2_PHC =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
const DJANGO_PBKDF2 = /^pbkdf2_sha256\$(\d+)\$([^$]+)\$([A-Za-z0-9+/=]+)$/;
// Django's own ceiling; guards against a crafted hash pinning the CPU.
const MAX_PBKDF2_ITERATIONS = 2_000_000;
// Bounds for parameters read back from stored argon2 hashes.
const MAX_ARGON2_MEMORY_KIB = 1_048_576;
const MAX_ARGON2_PASSES = 16;

const toB64 = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/=+$/, '');

/**
 * argon2id via node:crypto (Node 24+), stored in PHC string format.
 * Also verifies Django `pbkdf2_sha256$…` hashes migrated from Plane and
 * flags them for rehashing.
 */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    const nonce = randomBytes(ARGON2_SALT_LENGTH);
    const tag = await this.argon2id(password, nonce, {
      memory: ARGON2_MEMORY_KIB,
      passes: ARGON2_PASSES,
      parallelism: ARGON2_PARALLELISM,
      tagLength: ARGON2_TAG_LENGTH,
    });
    return (
      `$argon2id$v=${ARGON2_VERSION}` +
      `$m=${ARGON2_MEMORY_KIB},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}` +
      `$${toB64(nonce)}$${toB64(tag)}`
    );
  }

  async verify(
    storedHash: string,
    password: string,
  ): Promise<PasswordVerification> {
    const argon = ARGON2_PHC.exec(storedHash);
    if (argon) return this.verifyArgon2(argon, password);

    const django = DJANGO_PBKDF2.exec(storedHash);
    if (django) return this.verifyDjango(django, password);

    return { ok: false, needsRehash: false };
  }

  private async verifyArgon2(
    match: RegExpExecArray,
    password: string,
  ): Promise<PasswordVerification> {
    const [, version, memory, passes, parallelism, salt, expected] =
      match.map(String);
    const expectedTag = Buffer.from(expected, 'base64');
    const withinBounds =
      Number(memory) <= MAX_ARGON2_MEMORY_KIB &&
      Number(passes) >= 1 &&
      Number(passes) <= MAX_ARGON2_PASSES &&
      Number(parallelism) >= 1 &&
      Number(memory) >= 8 * Number(parallelism) &&
      expectedTag.length >= 4;
    if (!withinBounds) return { ok: false, needsRehash: false };

    const tag = await this.argon2id(password, Buffer.from(salt, 'base64'), {
      memory: Number(memory),
      passes: Number(passes),
      parallelism: Number(parallelism),
      tagLength: expectedTag.length,
    });
    const ok =
      Number(version) === ARGON2_VERSION && timingSafeEqual(tag, expectedTag);
    const needsRehash =
      Number(memory) < ARGON2_MEMORY_KIB ||
      Number(passes) < ARGON2_PASSES ||
      expectedTag.length < ARGON2_TAG_LENGTH;
    return { ok, needsRehash: ok && needsRehash };
  }

  private async verifyDjango(
    match: RegExpExecArray,
    password: string,
  ): Promise<PasswordVerification> {
    const [, iterations, salt, expected] = match.map(String);
    const rounds = Number(iterations);
    if (rounds < 1 || rounds > MAX_PBKDF2_ITERATIONS) {
      return { ok: false, needsRehash: false };
    }
    const expectedKey = Buffer.from(expected, 'base64');
    const key = await pbkdf2Async(
      password,
      salt,
      rounds,
      expectedKey.length,
      'sha256',
    );
    const ok =
      key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
    return { ok, needsRehash: ok };
  }

  private argon2id(
    password: string,
    nonce: Buffer,
    params: Pick<
      Argon2Parameters,
      'memory' | 'passes' | 'parallelism' | 'tagLength'
    >,
  ): Promise<Buffer> {
    return argon2Async('argon2id', { message: password, nonce, ...params });
  }
}
