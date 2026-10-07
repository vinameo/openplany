import request from 'supertest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Secret123!';

interface NameRow {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  updated_at: Date;
  is_superuser: boolean;
  email: string;
}

describe('Profile (e2e)', () => {
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
    names: { first?: string; last?: string; display?: string } = {},
    flags: Record<string, boolean> = {},
  ): Promise<void> {
    const columns = Object.keys(flags);
    await e2e.dataSource.query(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name${columns.map((c) => `, ${c}`).join('')})
       VALUES ($1, $1, $2, $3, $4, $5${columns.map((_, i) => `, $${i + 6}`).join('')})`,
      [
        email,
        passwordHash,
        names.first ?? 'An',
        names.last ?? 'Nguyen',
        names.display ?? 'An Nguyen',
        ...Object.values(flags),
      ],
    );
  }

  async function signInCookie(email: string): Promise<string> {
    const response = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies: string[] = response.headers[
      'set-cookie'
    ] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('op_session='));
    if (cookie === undefined) throw new Error('No session cookie was set');
    return cookie.split(';')[0];
  }

  async function findRow(email: string): Promise<NameRow> {
    const rows: NameRow[] = await e2e.dataSource.query(
      'SELECT first_name, last_name, display_name, updated_at, is_superuser, email FROM users WHERE email = $1',
      [email],
    );
    return rows[0];
  }

  function patch(cookie: string, body: object, origin = ORIGIN) {
    return http()
      .patch('/api/users/me')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  describe('GET /api/users/me', () => {
    it('returns the signed-in user without sensitive fields', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      const response = await http()
        .get('/api/users/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        email: 'an@openplany.dev',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        isInstanceAdmin: false,
      });
      for (const key of ['password', 'username', 'maskedAt', 'isActive']) {
        expect(response.body).not.toHaveProperty(key);
      }
    });

    it('answers 401 without a session', async () => {
      const response = await http().get('/api/users/me').expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('answers 403 PASSWORD_RESET_REQUIRED for a reset-only session', async () => {
      await createUser(
        'an@openplany.dev',
        {},
        { is_password_reset_required: true },
      );
      const cookie = await signInCookie('an@openplany.dev');

      const response = await http()
        .get('/api/users/me')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
    });
  });

  describe('PATCH /api/users/me', () => {
    it('updates the names, trims them and stamps updated_at', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');
      const before = await findRow('an@openplany.dev');

      const response = await patch(cookie, {
        firstName: '  Kai ',
        displayName: 'kaitranpo',
      }).expect(200);

      expect(response.body).toMatchObject({
        email: 'an@openplany.dev',
        firstName: 'Kai',
        lastName: 'Nguyen',
        displayName: 'kaitranpo',
      });
      const after = await findRow('an@openplany.dev');
      expect(after).toMatchObject({
        first_name: 'Kai',
        last_name: 'Nguyen',
        display_name: 'kaitranpo',
      });
      expect(after.updated_at.getTime()).toBeGreaterThan(
        before.updated_at.getTime(),
      );
    });

    it('stores Vietnamese names in composed (NFC) form', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      await patch(cookie, { lastName: 'Nguyễn' }).expect(200);

      expect((await findRow('an@openplany.dev')).last_name).toBe('Nguyễn');
    });

    it('rejects email and privileged fields without changing anything', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(cookie, {
        displayName: 'Kai',
        email: 'x@y.z',
        isSuperuser: true,
      }).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.body.fields).toHaveProperty('email');
      expect(response.body.fields).toHaveProperty('isSuperuser');
      expect(await findRow('an@openplany.dev')).toMatchObject({
        display_name: 'An Nguyen',
        is_superuser: false,
        email: 'an@openplany.dev',
      });
    });

    it('reports a field error for a blank first name', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(cookie, { firstName: '   ' }).expect(400);

      expect(response.body.fields).toEqual({
        firstName: 'Enter your first name',
      });
    });

    it('asks a user with no first name to fill it in', async () => {
      await createUser('an@openplany.dev', { first: '' });
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(cookie, { displayName: 'Kai' }).expect(400);

      expect(response.body.fields).toEqual({
        firstName: 'Enter your first name',
      });
      expect((await findRow('an@openplany.dev')).display_name).toBe(
        'An Nguyen',
      );
    });

    it('rejects an empty body', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(cookie, {}).expect(400);

      expect(response.body.message).toBe('Nothing to update');
    });

    it('answers 401 without a session', async () => {
      await http()
        .patch('/api/users/me')
        .set('Origin', ORIGIN)
        .send({ displayName: 'Kai' })
        .expect(401);
    });

    it('answers 403 for a foreign Origin', async () => {
      await createUser('an@openplany.dev');
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(
        cookie,
        { displayName: 'Kai' },
        'https://evil.example',
      ).expect(403);

      expect(response.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
      expect((await findRow('an@openplany.dev')).display_name).toBe(
        'An Nguyen',
      );
    });

    it('never touches another user', async () => {
      await createUser('an@openplany.dev');
      await createUser('binh@openplany.dev', { display: 'Binh' });
      const cookie = await signInCookie('an@openplany.dev');

      await patch(cookie, { displayName: 'Kai' }).expect(200);

      expect((await findRow('binh@openplany.dev')).display_name).toBe('Binh');
    });

    it('refuses a reset-only session', async () => {
      await createUser('an@openplany.dev', {}, { is_password_expired: true });
      const cookie = await signInCookie('an@openplany.dev');

      const response = await patch(cookie, { displayName: 'Kai' }).expect(403);

      expect(response.body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
    });
  });
});
