import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { AppDataSource } from '../database/dataSource.js';
import { Argon2PasswordHasher } from '../auth/passwordHasher.js';
import { User } from '../auth/entities/user.entity.js';
import { generateUsername } from '../admin/username.js';

/**
 * Reads one line from stdin without echoing it, so the password never shows
 * on screen, in scrollback or in a terminal recording.
 */
async function readSecret(label: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: process.stdin.isTTY,
  });
  try {
    // question() writes the label synchronously; mute everything typed after it.
    const answer = prompt.question(label);
    muted = true;
    return await answer;
  } finally {
    muted = false;
    prompt.close();
    process.stderr.write('\n');
  }
}

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
        throw new Error(`Unknown option: ${arg}`);
      }
    } else {
      positional.push(arg);
    }
  }

  const [rawEmail, displayName = ''] = positional;
  if (rawEmail === undefined) {
    throw new Error(
      'Usage: user:create <email> [display name] [--instance-admin]',
    );
  }
  const email = rawEmail.trim().toLowerCase();

  const password = await readSecret('Password: ');
  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters');
  }

  const hash = await new Argon2PasswordHasher().hash(password);
  await AppDataSource.initialize();
  try {
    await AppDataSource.getRepository(User).insert({
      email,
      username: generateUsername(),
      password: hash,
      displayName,
      isEmailVerified: true,
      isSuperuser: isInstanceAdmin,
      isStaff: false,
    });
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
