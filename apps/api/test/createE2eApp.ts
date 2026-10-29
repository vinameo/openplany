import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configureApp.js';

export interface E2eApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  reset: () => Promise<void>;
}

export interface TableWithDefaults {
  table: string;
  trigger: string;
  columns: string[];
}

export const TABLES_WITH_DEFAULTS: TableWithDefaults[] = [
  {
    table: 'work_item_states',
    trigger: 'work_item_states_protect_defaults',
    columns: [
      'id',
      'level',
      'default_key',
      'workspace_id',
      'project_id',
      'name',
      'state_group',
      'color',
      'created_by_id',
      'updated_by_id',
      'deleted_by_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  },
];

const BASE_TRUNCATE_TABLES = [
  'work_items',
  'project_member_role_history',
  'project_members',
  'projects',
  'role_permission_history',
  'workspace_member_role_history',
  'workspace_members',
  'workspaces',
  'login_attempts',
  'sessions',
  'users',
];

/** The real AppModule plus the main.ts setup, which Test.createTestingModule skips. */
export async function createE2eApp(): Promise<E2eApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  configureApp(app);
  // Listen once, so supertest reuses this server instead of starting and
  // stopping an ephemeral one per request.
  await app.listen(0, '127.0.0.1');

  const dataSource = app.get(DataSource);
  return {
    app,
    dataSource,
    reset: async () => {
      await dataSource.transaction(async (manager) => {
        const savedDefaults = new Map<string, Record<string, unknown>[]>();
        for (const item of TABLES_WITH_DEFAULTS) {
          const cols = item.columns.join(', ');
          const rows = await manager.query<Record<string, unknown>[]>(
            `SELECT ${cols} FROM ${item.table} WHERE level = 'default' ORDER BY default_key`,
          );
          savedDefaults.set(item.table, rows);
        }

        const allTruncateTables = Array.from(
          new Set([
            ...BASE_TRUNCATE_TABLES,
            ...TABLES_WITH_DEFAULTS.map((d) => d.table),
          ]),
        );
        await manager.query(`TRUNCATE ${allTruncateTables.join(', ')}`);

        for (const item of TABLES_WITH_DEFAULTS) {
          await manager.query(
            `ALTER TABLE ${item.table} DISABLE TRIGGER ${item.trigger}`,
          );

          const rows = savedDefaults.get(item.table) ?? [];
          if (rows.length > 0) {
            const colList = item.columns.join(', ');
            const placeholders = item.columns
              .map((_, i) => `$${i + 1}`)
              .join(', ');
            const insertSql = `INSERT INTO ${item.table} (${colList}) VALUES (${placeholders})`;
            for (const row of rows) {
              const values = item.columns.map((col) => row[col]);
              await manager.query(insertSql, values);
            }
          }

          await manager.query(
            `ALTER TABLE ${item.table} ENABLE TRIGGER ${item.trigger}`,
          );
        }

        await manager.query('DELETE FROM role_permissions');
        await manager.query(
          "DELETE FROM permissions WHERE key = 'workspace.unrecognized.custom'",
        );

        await manager.query(`
          INSERT INTO role_permissions (scope, role_key, permission_key)
          SELECT 'workspace', 'admin', key FROM permissions WHERE scope = 'workspace'
          UNION ALL SELECT 'workspace', 'member', k FROM unnest(ARRAY[
            'workspace.settings.view',
            'workspace.members.view',
            'workspace.projects.browse'
          ]::varchar[]) k
          UNION ALL SELECT 'workspace', 'guest', k FROM unnest(ARRAY[
            'workspace.settings.view'
          ]::varchar[]) k
          UNION ALL SELECT 'project', 'admin', key FROM permissions WHERE scope = 'project'
          UNION ALL SELECT 'project', 'contributor', k FROM unnest(ARRAY[
            'project.settings.view', 'project.members.view', 'project.workitems.view', 'project.workitems.create',
            'project.workitems.update.any', 'project.workitems.delete.own', 'project.comments.create', 'project.comments.update.own',
            'project.comments.delete.own', 'project.reactions.create', 'project.cycles.view', 'project.cycles.create',
            'project.cycles.update.any', 'project.cycles.delete.own', 'project.modules.view', 'project.modules.create',
            'project.modules.update.any', 'project.modules.delete.own', 'project.views.view', 'project.views.create',
            'project.views.update.own', 'project.views.delete.own', 'project.pages.view', 'project.pages.create',
            'project.pages.update.own', 'project.pages.delete.own', 'project.labels.view', 'project.states.view',
            'project.estimates.view', 'project.analytics.view', 'project.analytics.export'
          ]::varchar[]) k
          UNION ALL SELECT 'project', 'commenter', k FROM unnest(ARRAY[
            'project.settings.view', 'project.members.view', 'project.workitems.view', 'project.comments.create',
            'project.comments.update.own', 'project.comments.delete.own', 'project.reactions.create', 'project.cycles.view',
            'project.modules.view', 'project.views.view', 'project.pages.view', 'project.labels.view',
            'project.states.view', 'project.estimates.view', 'project.analytics.view'
          ]::varchar[]) k
          UNION ALL SELECT 'project', 'viewer', k FROM unnest(ARRAY[
            'project.settings.view', 'project.workitems.view', 'project.cycles.view', 'project.modules.view',
            'project.views.view', 'project.pages.view', 'project.labels.view', 'project.states.view',
            'project.estimates.view', 'project.analytics.view'
          ]::varchar[]) k;
        `);
        await manager.query('UPDATE roles SET permissions_version = 1');
      });
    },
  };
}
