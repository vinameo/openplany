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
  await app.init();

  const dataSource = app.get(DataSource);
  return {
    app,
    dataSource,
    reset: async () => {
      await dataSource.query(
        'TRUNCATE role_permission_history, workspace_member_role_history, workspace_members, workspaces, login_attempts, sessions, users',
      );
      await dataSource.query('DELETE FROM role_permissions');
      await dataSource.query(
        "DELETE FROM permissions WHERE key = 'workspace.unrecognized.custom'",
      );

      await dataSource.query(`
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
        UNION ALL SELECT 'project', 'guest', k FROM unnest(ARRAY[
          'project.settings.view', 'project.workitems.view', 'project.cycles.view', 'project.modules.view',
          'project.views.view', 'project.pages.view', 'project.labels.view', 'project.states.view',
          'project.estimates.view', 'project.analytics.view'
        ]::varchar[]) k;
      `);
      await dataSource.query('UPDATE roles SET permissions_version = 1');
    },
  };
}
