import { DataSource } from 'typeorm';
import { CreateAuthTables1791379542810 } from '../src/database/migrations/1791379542810-CreateAuthTables.js';
import { CreateWorkspaceTables1791465600000 } from '../src/database/migrations/1791465600000-CreateWorkspaceTables.js';
import { AddUsersCreatedBy1791534730151 } from '../src/database/migrations/1791534730151-AddUsersCreatedBy.js';
import { CreateWorkspaceMemberRoleHistory1791550147414 } from '../src/database/migrations/1791550147414-CreateWorkspaceMemberRoleHistory.js';
import { RemoveWorkspaceOwnerRole1791550200000 } from '../src/database/migrations/1791550200000-RemoveWorkspaceOwnerRole.js';
import { CreateRolesAndPermissions1791550300000 } from '../src/database/migrations/1791550300000-CreateRolesAndPermissions.js';
import { AddPermissionLabel1791550400000 } from '../src/database/migrations/1791550400000-AddPermissionLabel.js';
import { ReplaceHistoryRoleChecks1791603772081 } from '../src/database/migrations/1791603772081-ReplaceHistoryRoleChecks.js';
import { e2eEnv } from './e2eEnv.js';

export interface MigrationSeedSnapshot {
  roles: { scope: string; key: string; version: number }[];
  permissions: { key: string; scope: string; label: string }[];
  rolePermissions: { scope: string; roleKey: string; permissionKey: string }[];
}

export const MIGRATIONS = [
  CreateAuthTables1791379542810,
  CreateWorkspaceTables1791465600000,
  AddUsersCreatedBy1791534730151,
  CreateWorkspaceMemberRoleHistory1791550147414,
  RemoveWorkspaceOwnerRole1791550200000,
  CreateRolesAndPermissions1791550300000,
  AddPermissionLabel1791550400000,
  ReplaceHistoryRoleChecks1791603772081,
];

/** Creates the e2e database if needed and brings it to the latest migration. */
export async function setup({
  provide,
}: {
  provide?: (key: string, value: unknown) => void;
} = {}): Promise<void> {
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
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
  });
  await test.initialize();
  try {
    await test.runMigrations();
  } finally {
    await test.destroy();
  }

  // DB-24: Build temporary database <db>_seed to snapshot migration results
  const seedDbName = `${database}_seed`;
  if (!/^[a-z0-9_]+$/.test(seedDbName)) {
    throw new Error(`Refusing to create seed database "${seedDbName}"`);
  }

  const adminForSeed = new DataSource({
    type: 'postgres',
    url: adminUrl.toString(),
  });
  await adminForSeed.initialize();
  try {
    await adminForSeed.query(`DROP DATABASE IF EXISTS ${seedDbName}`);
    await adminForSeed.query(`CREATE DATABASE ${seedDbName}`);
  } finally {
    await adminForSeed.destroy();
  }

  const seedUrl = new URL(url);
  seedUrl.pathname = `/${seedDbName}`;
  const seedDs = new DataSource({
    type: 'postgres',
    url: seedUrl.toString(),
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
  });
  await seedDs.initialize();
  let snapshot: MigrationSeedSnapshot | null = null;
  try {
    await seedDs.runMigrations();

    const roles = await seedDs.query<
      { scope: string; key: string; version: number }[]
    >(
      'SELECT scope, key, permissions_version AS version FROM roles ORDER BY scope, key',
    );
    const permissions = await seedDs.query<
      { key: string; scope: string; label: string }[]
    >('SELECT key, scope, label FROM permissions ORDER BY key');
    const rolePermissions = await seedDs.query<
      { scope: string; roleKey: string; permissionKey: string }[]
    >(
      'SELECT scope, role_key AS "roleKey", permission_key AS "permissionKey" FROM role_permissions ORDER BY scope, role_key, permission_key',
    );

    snapshot = { roles, permissions, rolePermissions };
    if (provide) {
      provide('migrationSeed', snapshot);
    }
  } finally {
    await seedDs.destroy();

    const adminCleanup = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await adminCleanup.initialize();
    try {
      await adminCleanup.query(`DROP DATABASE IF EXISTS ${seedDbName}`);
    } finally {
      await adminCleanup.destroy();
    }
  }
}
