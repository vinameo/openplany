import type { MigrationInterface, QueryRunner } from 'typeorm';

export const PERMISSION_LABELS: Record<string, string> = {
  // Workspace permissions (12)
  'workspace.settings.view': 'View workspace settings',
  'workspace.settings.update': 'Edit workspace settings',
  'workspace.delete': 'Delete workspace',
  'workspace.members.view': 'View workspace members',
  'workspace.members.email.view': 'View member emails',
  'workspace.members.add': 'Add members',
  'workspace.members.remove': 'Remove members',
  'workspace.members.role.update': 'Change member roles',
  'workspace.members.history.view': 'View member history',
  'workspace.projects.create': 'Create projects',
  'workspace.projects.browse': 'Browse projects',
  'workspace.projects.delete': 'Delete projects',

  // Project permissions (45)
  'project.settings.view': 'View project settings',
  'project.settings.update': 'Edit project settings',
  'project.archive': 'Archive project',
  'project.members.view': 'View project members',
  'project.members.manage': 'Manage project members',
  'project.workitems.view': 'View work items',
  'project.workitems.create': 'Create work items',
  'project.workitems.update.any': 'Edit any work items',
  'project.workitems.delete.any': 'Delete any work items',
  'project.workitems.delete.own': 'Delete own work items',
  'project.comments.create': 'Add comments',
  'project.comments.update.own': 'Edit own comments',
  'project.comments.delete.any': 'Delete any comments',
  'project.comments.delete.own': 'Delete own comments',
  'project.reactions.create': 'Add reactions',
  'project.cycles.view': 'View cycles',
  'project.cycles.create': 'Create cycles',
  'project.cycles.update.any': 'Edit any cycles',
  'project.cycles.delete.any': 'Delete any cycles',
  'project.cycles.delete.own': 'Delete own cycles',
  'project.modules.view': 'View modules',
  'project.modules.create': 'Create modules',
  'project.modules.update.any': 'Edit any modules',
  'project.modules.delete.any': 'Delete any modules',
  'project.modules.delete.own': 'Delete own modules',
  'project.views.view': 'View views',
  'project.views.create': 'Create views',
  'project.views.update.any': 'Edit any views',
  'project.views.delete.any': 'Delete any views',
  'project.views.update.own': 'Edit own views',
  'project.views.delete.own': 'Delete own views',
  'project.pages.view': 'View pages',
  'project.pages.create': 'Create pages',
  'project.pages.update.any': 'Edit any pages',
  'project.pages.delete.any': 'Delete any pages',
  'project.pages.update.own': 'Edit own pages',
  'project.pages.delete.own': 'Delete own pages',
  'project.labels.view': 'View labels',
  'project.states.view': 'View states',
  'project.estimates.view': 'View estimates',
  'project.labels.manage': 'Manage labels',
  'project.states.manage': 'Manage states',
  'project.estimates.manage': 'Manage estimates',
  'project.analytics.view': 'View analytics',
  'project.analytics.export': 'Export analytics',
};

export class AddPermissionLabel1791550400000 implements MigrationInterface {
  name = 'AddPermissionLabel1791550400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Add label column (nullable during seeding)
    await queryRunner.query(`
      ALTER TABLE permissions
        ADD COLUMN label varchar(200);
    `);

    // 2. Populate label for all 57 permissions
    const valuesClause = Object.entries(PERMISSION_LABELS)
      .map(([key, label]) => `('${key}', '${label.replace(/'/g, "''")}')`)
      .join(',\n        ');

    await queryRunner.query(`
      UPDATE permissions AS p
      SET label = v.label
      FROM (VALUES
        ${valuesClause}
      ) AS v(key, label)
      WHERE p.key = v.key;
    `);

    // Fallback for any legacy/custom test rows: populate label with key
    await queryRunner.query(`
      UPDATE permissions
      SET label = key
      WHERE label IS NULL;
    `);

    // 3. Make column NOT NULL
    await queryRunner.query(`
      ALTER TABLE permissions
        ALTER COLUMN label SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE permissions
        DROP COLUMN IF EXISTS label;
    `);
  }
}

