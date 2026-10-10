import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Argon2PasswordHasher } from '../../src/auth/passwordHasher.js';
import type { E2eApp } from '../createE2eApp.js';

export const DEFAULT_E2E_ORIGIN = 'http://localhost:5173';
export const DEFAULT_E2E_PASSWORD = 'Secret123!';

let cachedPasswordHash: string | null = null;

export async function getE2ePasswordHash(
  password = DEFAULT_E2E_PASSWORD,
): Promise<string> {
  if (password === DEFAULT_E2E_PASSWORD && cachedPasswordHash) {
    return cachedPasswordHash;
  }
  const hash = await new Argon2PasswordHasher().hash(password);
  if (password === DEFAULT_E2E_PASSWORD) {
    cachedPasswordHash = hash;
  }
  return hash;
}

export interface CreateUserOpts {
  first?: string;
  last?: string;
  display?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  timezone?: string;
  username?: string;
  password?: string;
  is_superuser?: boolean;
  is_active?: boolean;
  is_bot?: boolean;
  masked_at?: Date | string | null;
  [key: string]: unknown;
}

export async function createUser(
  e2e: E2eApp,
  email: string | null,
  opts: CreateUserOpts = {},
): Promise<string> {
  const password = opts.password ?? DEFAULT_E2E_PASSWORD;
  const passwordHash = await getE2ePasswordHash(password);

  const first = opts.first ?? opts.firstName ?? 'Test';
  const last = opts.last ?? opts.lastName ?? 'User';
  const display = opts.display ?? opts.displayName ?? `${first} ${last}`.trim();
  const timezone = opts.timezone ?? 'UTC';
  const username = opts.username ?? email ?? `user_${randomUUID()}`;

  // Default flags
  const isSuperuser = opts.is_superuser ?? false;
  const isActive = opts.is_active ?? true;
  const isBot = opts.is_bot ?? false;
  const maskedAt = opts.masked_at ?? null;

  // Extract any additional columns from opts
  const standardKeys = new Set([
    'first',
    'last',
    'display',
    'firstName',
    'lastName',
    'displayName',
    'timezone',
    'username',
    'password',
    'is_superuser',
    'is_active',
    'is_bot',
    'masked_at',
  ]);

  const extraColumns: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(opts)) {
    if (!standardKeys.has(key)) {
      extraColumns[key] = val;
    }
  }

  const columns = [
    'email',
    'username',
    'password',
    'first_name',
    'last_name',
    'display_name',
    'user_timezone',
    'is_superuser',
    'is_active',
    'is_bot',
    'masked_at',
    ...Object.keys(extraColumns),
  ];

  const values = [
    email,
    username,
    passwordHash,
    first,
    last,
    display,
    timezone,
    isSuperuser,
    isActive,
    isBot,
    maskedAt,
    ...Object.values(extraColumns),
  ];

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const result = await e2e.dataSource.query<{ id: string }[]>(
    `INSERT INTO users (${columns.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    values,
  );

  return result[0]!.id;
}

export async function signInCookie(
  e2e: E2eApp,
  email: string,
  password = DEFAULT_E2E_PASSWORD,
  origin = DEFAULT_E2E_ORIGIN,
): Promise<string> {
  const response = await request(e2e.app.getHttpServer())
    .post('/api/auth/sign-in')
    .set('Origin', origin)
    .send({ email, password })
    .expect(200);

  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  if (!cookies) {
    throw new Error('No set-cookie header returned');
  }

  const cookie = cookies.find((val) => val.startsWith('op_session='));
  if (!cookie) {
    throw new Error('No session cookie found');
  }

  return cookie.split(';')[0]!;
}

