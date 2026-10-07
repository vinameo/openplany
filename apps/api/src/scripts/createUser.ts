import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { AppDataSource } from '../database/dataSource.js';
import { Argon2PasswordHasher } from '../auth/passwordHasher.js';

// Dev helper until sign-up exists. The password is read from stdin so it
// never lands in shell history or the process list:
//   pnpm --filter @repo/api user:create an@openplany.dev "An Nguyen"
async function main(): Promise<void> {
  const [rawEmail, displayName = ''] = process.argv.slice(2);
  if (rawEmail === undefined) {
    throw new Error('Usage: user:create <email> [display name]');
  }
  const email = rawEmail.trim().toLowerCase();

  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const password = await prompt.question('Password: ');
  prompt.close();
  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters');
  }

  const hash = await new Argon2PasswordHasher().hash(password);
  await AppDataSource.initialize();
  try {
    await AppDataSource.query(
      `INSERT INTO users (email, username, password, display_name, is_email_verified)
       VALUES ($1, $2, $3, $4, true)`,
      [email, email, hash, displayName],
    );
  } finally {
    await AppDataSource.destroy();
  }
  process.stderr.write(`Created user ${email}\n`);
}

await main();
