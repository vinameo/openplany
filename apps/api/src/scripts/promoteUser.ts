import 'reflect-metadata';
import { AppDataSource } from '../database/dataSource.js';
import { User } from '../auth/entities/user.entity.js';

// CLI helper to elevate an existing user to instance admin (Q-DB1, Ticket 10):
//   pnpm --filter @repo/api user:promote an@openplany.dev
async function main(): Promise<void> {
  const [rawEmail] = process.argv.slice(2);
  if (rawEmail === undefined || rawEmail.trim() === '') {
    process.stderr.write('Usage: user:promote <email>\n');
    process.exitCode = 1;
    return;
  }
  const email = rawEmail.trim().toLowerCase();

  await AppDataSource.initialize();
  try {
    const users = AppDataSource.getRepository(User);
    // Matches the users_email_lower_key expression index exactly.
    const user = await users
      .createQueryBuilder('user')
      .select(['user.id', 'user.isSuperuser'])
      .where('lower(user.email) = :email', { email })
      .getOne();

    if (user === null) {
      process.stderr.write(`User not found: ${email}\n`);
      process.exitCode = 1;
      return;
    }
    if (user.isSuperuser) {
      process.stderr.write(`${email} is already an instance admin\n`);
      return;
    }

    await users.update(
      { id: user.id },
      { isSuperuser: true, updatedAt: new Date() },
    );
    process.stderr.write(`Promoted ${email} to instance admin\n`);
  } finally {
    // Runs on every path above: `return` (unlike process.exit) unwinds finally.
    await AppDataSource.destroy();
  }
}

await main();
