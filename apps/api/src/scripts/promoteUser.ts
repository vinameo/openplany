import 'reflect-metadata';
import { AppDataSource } from '../database/dataSource.js';

// CLI helper to elevate an existing user to instance admin (Q-DB1, Ticket 10):
//   pnpm --filter @repo/api user:promote an@openplany.dev
async function main(): Promise<void> {
  const [rawEmail] = process.argv.slice(2);
  if (rawEmail === undefined || rawEmail.trim() === '') {
    process.stderr.write('Usage: user:promote <email>\n');
    process.exit(1);
  }
  const email = rawEmail.trim().toLowerCase();

  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.query<{ id: string; is_superuser: boolean }[]>(
      `SELECT id, is_superuser FROM users WHERE lower(email) = lower($1)`,
      [email],
    );

    if (rows.length === 0) {
      process.stderr.write(`User not found: ${email}\n`);
      process.exit(1);
    }

    const user = rows[0];
    if (user.is_superuser) {
      process.stderr.write(`${email} is already an instance admin\n`);
      process.exit(0);
    }

    await AppDataSource.query(
      `UPDATE users SET is_superuser = true, updated_at = now() WHERE lower(email) = lower($1)`,
      [email],
    );

    process.stderr.write(`Promoted ${email} to instance admin\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

await main();

