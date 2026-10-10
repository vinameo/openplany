import { AuthDataRetentionService } from '../src/auth/authDataRetention.service.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const DAY = 24 * 60 * 60 * 1000;

describe('AuthDataRetentionService (e2e)', () => {
  let e2e: E2eApp;
  let userId: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  beforeEach(async () => {
    await e2e.reset();
    const rows: { id: string }[] = await e2e.dataSource.query(
      `INSERT INTO users (email, username, password)
       VALUES ('an@openplany.dev', 'an', 'x') RETURNING id`,
    );
    userId = rows[0].id;
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * DAY);
  }

  async function insertAttempt(createdAt: Date): Promise<void> {
    await e2e.dataSource.query(
      `INSERT INTO login_attempts (email_hash, ip, result, reason, created_at)
       VALUES ('hash', '203.0.113.7', 'failure', 'wrong_password', $1)`,
      [createdAt],
    );
  }

  async function insertSession(
    token: string,
    createdAt: Date,
    expiresAt: Date,
    revokedAt: Date | null = null,
  ): Promise<void> {
    await e2e.dataSource.query(
      `INSERT INTO sessions (user_id, token_hash, login_medium, created_at, last_used_at, expires_at, revoked_at)
       VALUES ($1, $2, 'email', $3, $3, $4, $5)`,
      [userId, token, createdAt, expiresAt, revokedAt],
    );
  }

  it('deletes login attempts older than 90 days and sessions ended more than 30 days ago', async () => {
    await insertAttempt(daysAgo(91));
    await insertAttempt(daysAgo(89));
    await insertSession('expired-long-ago', daysAgo(45), daysAgo(31));
    await insertSession(
      'revoked-long-ago',
      daysAgo(40),
      daysAgo(10),
      daysAgo(31),
    );
    await insertSession('expired-recently', daysAgo(36), daysAgo(29));
    await insertSession('live', daysAgo(1), new Date(Date.now() + DAY));

    const result = await e2e.app.get(AuthDataRetentionService).purge();

    expect(result).toEqual({ loginAttempts: 1, sessions: 2 });
    const attempts: { count: number }[] = await e2e.dataSource.query(
      'SELECT count(*)::int AS count FROM login_attempts',
    );
    expect(attempts[0].count).toBe(1);
    const sessions: { token_hash: string }[] = await e2e.dataSource.query(
      'SELECT token_hash FROM sessions ORDER BY token_hash',
    );
    expect(sessions.map((s) => s.token_hash)).toEqual([
      'expired-recently',
      'live',
    ]);
  });
});
