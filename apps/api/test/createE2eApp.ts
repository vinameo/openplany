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
        const defaults = await manager.query<
          {
            id: string;
            level: string;
            default_key: string;
            workspace_id: string | null;
            project_id: string | null;
            name: string;
            state_group: string;
            color: string;
            created_by_id: string | null;
            updated_by_id: string | null;
            deleted_by_id: string | null;
            created_at: Date;
            updated_at: Date;
            deleted_at: Date | null;
          }[]
        >(
          `SELECT id, level, default_key, workspace_id, project_id, name, state_group, color, created_by_id, updated_by_id, deleted_by_id, created_at, updated_at, deleted_at FROM work_item_states WHERE level = 'default' ORDER BY default_key`,
        );

        await manager.query(
          'TRUNCATE work_items, work_item_states, project_member_role_history, project_members, projects, role_permission_history, workspace_member_role_history, workspace_members, workspaces, login_attempts, sessions, users',
        );

        await manager.query(
          'ALTER TABLE work_item_states DISABLE TRIGGER work_item_states_protect_defaults',
        );

        for (const d of defaults) {
          await manager.query(
            `INSERT INTO work_item_states
              (id, level, default_key, workspace_id, project_id, name, state_group, color, created_by_id, updated_by_id, deleted_by_id, created_at, updated_at, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              d.id,
              d.level,
              d.default_key,
              d.workspace_id,
              d.project_id,
              d.name,
              d.state_group,
              d.color,
              d.created_by_id,
              d.updated_by_id,
              d.deleted_by_id,
              d.created_at,
              d.updated_at,
              d.deleted_at,
            ],
          );
        }

        await manager.query(
          'ALTER TABLE work_item_states ENABLE TRIGGER work_item_states_protect_defaults',
        );

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
