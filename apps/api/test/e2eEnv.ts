import { config } from 'dotenv';

/**
 * Env for e2e runs: the dev DATABASE_URL from .env with a `_test` database,
 * so tests can truncate tables without touching dev data.
 */
export function e2eEnv(): Record<string, string> {
  const fromFile = config({ path: '.env', quiet: true }).parsed ?? {};
  const base = process.env.DATABASE_URL ?? fromFile.DATABASE_URL;
  if (base === undefined) {
    throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
  }
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`;

  return {
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    DB_MIGRATIONS_RUN: 'false',
    DB_LOGGING: 'false',
    REDIS_URL: fromFile.REDIS_URL ?? 'redis://localhost:6379',
    CORS_ORIGIN: 'http://localhost:5173',
    AUTH_HMAC_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
    SESSION_COOKIE_SECURE: 'false',
    TRUST_PROXY: 'false',
  };
}
