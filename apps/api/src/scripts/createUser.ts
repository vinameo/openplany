import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { AppDataSource } from '../database/dataSource.js';
import { Argon2PasswordHasher } from '../auth/passwordHasher.js';
import { generateUsername } from '../admin/username.js';

// Dev / operator helper until sign-up exists. The password is read from stdin so it
// never lands in shell history or the process list:
//   pnpm --filter @repo/api user:create an@openplany.dev "An Nguyen" [--instance-admin]
async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  let isInstanceAdmin = false;
  const positional: string[] = [];

  for (const arg of rawArgs) {
    if (arg.startsWith('--')) {
      if (arg === '--instance-admin') {
        isInstanceAdmin = true;
      } else {
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.exit(1);
      }
    } else {
      positional.push(arg);
    }
  }

  const [rawEmail, displayName = ''] = positional;
  if (rawEmail === undefined) {
    throw new Error('Usage: user:create <email> [display name] [--instance-admin]');
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
  const username = generateUsername();
  await AppDataSource.initialize();
  try {
    await AppDataSource.query(
      `INSERT INTO users (email, username, password, display_name, is_email_verified, is_superuser)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [email, username, hash, displayName, isInstanceAdmin],
    );
  } finally {
    await AppDataSource.destroy();
  }

  if (isInstanceAdmin) {
    process.stderr.write(`Created instance admin ${email}\n`);
  } else {
    process.stderr.write(`Created user ${email}\n`);
  }
}

await main();
