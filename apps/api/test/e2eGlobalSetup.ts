import { DataSource } from 'typeorm';
import { CreateAuthTables1791379542810 } from '../src/database/migrations/1791379542810-CreateAuthTables.js';
import { CreateWorkspaceTables1791465600000 } from '../src/database/migrations/1791465600000-CreateWorkspaceTables.js';
import { AddUsersCreatedBy1791534730151 } from '../src/database/migrations/1791534730151-AddUsersCreatedBy.js';
import { CreateWorkspaceMemberRoleHistory1791550147414 } from '../src/database/migrations/1791550147414-CreateWorkspaceMemberRoleHistory.js';
import { e2eEnv } from './e2eEnv.js';

/** Creates the e2e database if needed and brings it to the latest migration. */
export async function setup(): Promise<void> {
  const url = new URL(e2eEnv().DATABASE_URL);
  const database = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  try {
    const rows: unknown[] = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (rows.length === 0) {
      // Identifiers cannot be bound as parameters; the name is derived from
      // our own config and checked against a strict pattern first.
      if (!/^[a-z0-9_]+$/.test(database)) {
        throw new Error(`Refusing to create database "${database}"`);
      }
      await admin.query(`CREATE DATABASE ${database}`);
    }
  } finally {
    await admin.destroy();
  }

  const test = new DataSource({
    type: 'postgres',
    url: url.toString(),
    migrations: [
      CreateAuthTables1791379542810,
      CreateWorkspaceTables1791465600000,
      AddUsersCreatedBy1791534730151,
      CreateWorkspaceMemberRoleHistory1791550147414,
    ],
    migrationsTableName: 'typeorm_migrations',
  });
  await test.initialize();
  try {
    await test.runMigrations();
  } finally {
    await test.destroy();
  }
}
