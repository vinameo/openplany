import request from 'supertest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Secret123!';
const SENSITIVE_KEYS = [
  'password',
  'token',
  'lastLoginIp',
  'lastLoginUserAgent',
  'maskedAt',
  'isActive',
  'isBot',
];

interface UserRow {
  last_login_time: Date | null;
  last_login_ip: string | null;
  last_login_medium: string | null;
  last_login_uagent: string | null;
  last_logout_time: Date | null;
  password: string;
}

describe('Auth (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function createUser(
    email: string,
    flags: Record<string, boolean | string> = {},
    hash = passwordHash,
  ): Promise<void> {
    const columns = Object.keys(flags);
    await e2e.dataSource.query(
      `INSERT INTO users (email, username, password, display_name${columns.map((c) => `, ${c}`).join('')})
       VALUES ($1, $1, $2, 'An Nguyen'${columns.map((_, i) => `, $${i + 3}`).join('')})`,
      [email, hash, ...Object.values(flags)],
    );
  }

  async function findUser(email: string): Promise<UserRow> {
    const rows: UserRow[] = await e2e.dataSource.query(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    return rows[0];
  }

  function signIn(body: object, origin = ORIGIN) {
    return http()
      .post('/api/auth/sign-in')
      .set('Origin', origin)
      .set('User-Agent', 'e2e-agent')
      .send(body);
  }

  function sessionCookie(setCookie: string[] | string | undefined): string {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const cookie = cookies.find((value) => value.startsWith('op_session='));
    if (cookie === undefined) throw new Error('No session cookie was set');
    return cookie.split(';')[0];
  }

  describe('POST /api/auth/sign-in', () => {
    it('signs in, sets an httpOnly cookie and records the login', async () => {
      await createUser('an@openplany.dev');

      const response = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(200);

      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^op_session=[\w-]{43};/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toEqual(expect.any(String));
      expect(response.body).toMatchObject({
        user: { email: 'an@openplany.dev', displayName: 'An Nguyen' },
        requiresPasswordReset: false,
      });
      for (const key of SENSITIVE_KEYS) {
        expect(response.body.user).not.toHaveProperty(key);
      }

      const user = await findUser('an@openplany.dev');
      expect(user.last_login_time).not.toBeNull();
      expect(user.last_login_ip).not.toBeNull();
      expect(user.last_login_medium).toBe('email');
      expect(user.last_login_uagent).toBe('e2e-agent');
    });

    it('finds the account whatever the case and surrounding spaces', async () => {
      await createUser('an@openplany.dev');

      await signIn({ email: '  An@OpenPlany.dev ', password: PASSWORD }).expect(
        200,
      );
    });

    it('answers an unknown email and a wrong password identically', async () => {
      await createUser('an@openplany.dev');

      const unknown = await signIn({
        email: 'ghost@openplany.dev',
        password: PASSWORD,
      }).expect(401);
      const wrong = await signIn({
        email: 'an@openplany.dev',
        password: 'wrong',
      }).expect(401);

      const strip = ({ requestId: _id, ...rest }: Record<string, unknown>) =>
        rest;
      expect(strip(wrong.body)).toEqual(strip(unknown.body));
      expect(wrong.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
      });
    });

    it('rejects a deactivated account with 403 and leaves last_login untouched', async () => {
      await createUser('an@openplany.dev', { is_active: false });

      const response = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(403);

      expect(response.body.code).toBe('ACCOUNT_DEACTIVATED');
      expect((await findUser('an@openplany.dev')).last_login_time).toBeNull();
    });

    it.each(['is_bot', 'is_password_autoset'])(
      'treats %s accounts like unknown emails',
      async (flag) => {
        await createUser('an@openplany.dev', { [flag]: true });

        const response = await signIn({
          email: 'an@openplany.dev',
          password: PASSWORD,
        }).expect(401);

        expect(response.body.code).toBe('INVALID_CREDENTIALS');
      },
    );

    it('starts a reset-only session when a new password is required', async () => {
      await createUser('an@openplany.dev', {
        is_password_reset_required: true,
      });

      const response = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(200);

      expect(response.body.requiresPasswordReset).toBe(true);
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=900');
    });

    it('returns 429 with Retry-After on the 6th try after 5 failures, even with the right password', async () => {
      await createUser('an@openplany.dev');
      for (let i = 0; i < 5; i += 1) {
        await signIn({ email: 'an@openplany.dev', password: 'wrong' }).expect(
          401,
        );
      }

      const response = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(response.body).toMatchObject({
        code: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: Number(response.headers['retry-after']),
      });
    });

    it('lets at most 5 of 12 parallel wrong-password tries reach the password check', async () => {
      await createUser('an@openplany.dev');

      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          signIn({ email: 'an@openplany.dev', password: 'wrong' }),
        ),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 401)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(7);

      const rows: { result: string; reason: string | null }[] =
        await e2e.dataSource.query(
          'SELECT result, reason FROM login_attempts ORDER BY created_at',
        );
      expect(rows.filter((row) => row.result === 'failure')).toEqual(
        Array.from({ length: 5 }, () => ({
          result: 'failure',
          reason: 'wrong_password',
        })),
      );
    });

    it('marks the reserved attempt as the successful login', async () => {
      await createUser('an@openplany.dev');

      await signIn({ email: 'an@openplany.dev', password: PASSWORD }).expect(
        200,
      );

      const rows: { result: string; reason: string | null }[] =
        await e2e.dataSource.query('SELECT result, reason FROM login_attempts');
      expect(rows).toEqual([{ result: 'success', reason: null }]);
    });

    it('rehashes a migrated Django password on first sign-in', async () => {
      // hashlib.pbkdf2_hmac('sha256', 'lètmein'.encode(), b'seasalt', 260000)
      await createUser(
        'an@openplany.dev',
        {},
        'pbkdf2_sha256$260000$seasalt$YlZ2Vggtqdc61YjArZuoApoBh9JNGYoDRBUGu6tcJQo=',
      );

      await signIn({ email: 'an@openplany.dev', password: 'lètmein' }).expect(
        200,
      );

      expect((await findUser('an@openplany.dev')).password).toMatch(
        /^\$argon2id\$/,
      );
    });

    it('blocks requests from a foreign Origin', async () => {
      const response = await signIn(
        { email: 'an@openplany.dev', password: PASSWORD },
        'https://evil.example',
      ).expect(403);

      expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('rejects unknown fields and reports field errors', async () => {
      const response = await signIn({
        email: 'not-an-email',
        password: '',
        isSuperuser: true,
      }).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        fields: {
          email: 'Enter a valid email',
          password: 'Enter your password',
          isSuperuser: expect.any(String),
        },
      });
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns the signed-in user for a valid cookie', async () => {
      await createUser('an@openplany.dev');
      const signedIn = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(200);

      const response = await http()
        .get('/api/auth/session')
        .set('Cookie', sessionCookie(signedIn.headers['set-cookie']))
        .expect(200);

      expect(response.body).toEqual(signedIn.body);
    });

    it('returns 401 without a cookie', async () => {
      const response = await http().get('/api/auth/session').expect(401);

      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 and clears the cookie for an unknown token', async () => {
      const response = await http()
        .get('/api/auth/session')
        .set('Cookie', 'op_session=forged')
        .expect(401);

      expect(String(response.headers['set-cookie'])).toMatch(/^op_session=;/);
    });
  });

  describe('POST /api/auth/sign-out', () => {
    it('revokes the session and records the logout', async () => {
      await createUser('an@openplany.dev');
      const signedIn = await signIn({
        email: 'an@openplany.dev',
        password: PASSWORD,
      }).expect(200);
      const cookie = sessionCookie(signedIn.headers['set-cookie']);

      await http()
        .post('/api/auth/sign-out')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);

      await http().get('/api/auth/session').set('Cookie', cookie).expect(401);
      expect(
        (await findUser('an@openplany.dev')).last_logout_time,
      ).not.toBeNull();
    });

    it('answers 204 even without a session', async () => {
      await http().post('/api/auth/sign-out').set('Origin', ORIGIN).expect(204);
    });
  });
});
