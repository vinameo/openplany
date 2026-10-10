import type { MigrationInterface, QueryRunner } from 'typeorm';

// Roles and permissions feature (packages/docs/6-roles-and-permissions/3-database-spec.md B11).
// Creates roles, permissions, role_permissions, role_permission_history tables,
// seeds default role permissions, and adds role_scope foreign key to workspace_members.
export class CreateRolesAndPermissions1791550300000 implements MigrationInterface {
  name = 'CreateRolesAndPermissions1791550300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Roles
    await queryRunner.query(`
      CREATE TABLE roles (
        scope                varchar(16)  NOT NULL,
        key                  varchar(20)  NOT NULL,
        permissions_version  integer      NOT NULL DEFAULT 1,
        created_at           timestamptz  NOT NULL DEFAULT now(),
        updated_at           timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT roles_pkey PRIMARY KEY (scope, key),
        CONSTRAINT roles_scope_check CHECK (scope IN ('workspace', 'project')),
        CONSTRAINT roles_key_check CHECK (key ~ '^[a-z][a-z_]*$'),
        CONSTRAINT roles_permissions_version_check CHECK (permissions_version >= 1)
      );
    `);

    // 2. Permissions
    await queryRunner.query(`
      CREATE TABLE permissions (
        key         varchar(100)  NOT NULL,
        scope       varchar(16)   NOT NULL,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT permissions_pkey PRIMARY KEY (key),
        CONSTRAINT permissions_key_scope_key UNIQUE (key, scope),
        CONSTRAINT permissions_scope_check CHECK (scope IN ('workspace', 'project')),
        CONSTRAINT permissions_key_check CHECK (
          key ~ '^[a-z]+(\\.[a-z_]+)+$' AND split_part(key, '.', 1) = scope
        )
      );
    `);

    // 3. Role Permissions
    await queryRunner.query(`
      CREATE TABLE role_permissions (
        scope           varchar(16)   NOT NULL,
        role_key        varchar(20)   NOT NULL,
        permission_key  varchar(100)  NOT NULL,
        created_at      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT role_permissions_pkey PRIMARY KEY (scope, role_key, permission_key),
        CONSTRAINT role_permissions_role_fkey
          FOREIGN KEY (scope, role_key) REFERENCES roles (scope, key),
        CONSTRAINT role_permissions_permission_fkey
          FOREIGN KEY (permission_key, scope) REFERENCES permissions (key, scope)
      );
    `);

    // 4. Role Permission History
    await queryRunner.query(`
      CREATE TABLE role_permission_history (
        id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        scope           varchar(16)   NOT NULL,
        role_key        varchar(20)   NOT NULL,
        permission_key  varchar(100)  NOT NULL,
        change_type     varchar(16)   NOT NULL,
        actor_id        uuid          CONSTRAINT rph_actor_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        request_id      varchar(128),
        created_at      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT rph_role_fkey FOREIGN KEY (scope, role_key) REFERENCES roles (scope, key),
        CONSTRAINT rph_permission_fkey FOREIGN KEY (permission_key, scope) REFERENCES permissions (key, scope),
        CONSTRAINT rph_change_type_check CHECK (change_type IN ('seeded', 'granted', 'revoked')),
        CONSTRAINT rph_shape_check CHECK (
          CASE change_type
            WHEN 'seeded'  THEN actor_id IS NULL AND request_id IS NULL
            WHEN 'granted' THEN request_id IS NOT NULL
            WHEN 'revoked' THEN request_id IS NOT NULL
            ELSE false
          END
        )
      );
      CREATE INDEX idx_rph_created_at      ON role_permission_history (created_at DESC, id DESC);
      CREATE INDEX idx_rph_role_created_at ON role_permission_history (scope, role_key, created_at DESC);
    `);

    // 5. Default data (literal)
    await queryRunner.query(`
      INSERT INTO roles (scope, key) VALUES
        ('workspace', 'admin'), ('workspace', 'member'), ('workspace', 'guest'),
        ('project', 'admin'), ('project', 'contributor'), ('project', 'commenter'), ('project', 'guest');

      INSERT INTO permissions (key, scope)
      SELECT k, split_part(k, '.', 1) FROM unnest(ARRAY[
        'workspace.settings.view',
        'workspace.settings.update',
        'workspace.delete',
        'workspace.members.view',
        'workspace.members.email.view',
        'workspace.members.add',
        'workspace.members.remove',
        'workspace.members.role.update',
        'workspace.members.history.view',
        'workspace.projects.create',
        'workspace.projects.browse',
        'workspace.projects.delete',
        'project.settings.view',
        'project.settings.update',
        'project.archive',
        'project.members.view',
        'project.members.manage',
        'project.workitems.view',
        'project.workitems.create',
        'project.workitems.update.any',
        'project.workitems.delete.any',
        'project.workitems.delete.own',
        'project.comments.create',
        'project.comments.update.own',
        'project.comments.delete.any',
        'project.comments.delete.own',
        'project.reactions.create',
        'project.cycles.view',
        'project.cycles.create',
        'project.cycles.update.any',
        'project.cycles.delete.any',
        'project.cycles.delete.own',
        'project.modules.view',
        'project.modules.create',
        'project.modules.update.any',
        'project.modules.delete.any',
        'project.modules.delete.own',
        'project.views.view',
        'project.views.create',
        'project.views.update.any',
        'project.views.delete.any',
        'project.views.update.own',
        'project.views.delete.own',
        'project.pages.view',
        'project.pages.create',
        'project.pages.update.any',
        'project.pages.delete.any',
        'project.pages.update.own',
        'project.pages.delete.own',
        'project.labels.view',
        'project.states.view',
        'project.estimates.view',
        'project.labels.manage',
        'project.states.manage',
        'project.estimates.manage',
        'project.analytics.view',
        'project.analytics.export'
      ]::varchar[]) AS k;

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
      UNION ALL SELECT 'project', 'admin', k FROM unnest(ARRAY[
        'project.settings.view',
        'project.settings.update',
        'project.archive',
        'project.members.view',
        'project.members.manage',
        'project.workitems.view',
        'project.workitems.create',
        'project.workitems.update.any',
        'project.workitems.delete.any',
        'project.comments.create',
        'project.comments.update.own',
        'project.comments.delete.any',
        'project.reactions.create',
        'project.cycles.view',
        'project.cycles.create',
        'project.cycles.update.any',
        'project.cycles.delete.any',
        'project.modules.view',
        'project.modules.create',
        'project.modules.update.any',
        'project.modules.delete.any',
        'project.views.view',
        'project.views.create',
        'project.views.update.any',
        'project.views.delete.any',
        'project.pages.view',
        'project.pages.create',
        'project.pages.update.any',
        'project.pages.delete.any',
        'project.labels.view',
        'project.states.view',
        'project.estimates.view',
        'project.labels.manage',
        'project.states.manage',
        'project.estimates.manage',
        'project.analytics.view',
        'project.analytics.export'
      ]::varchar[]) k
      UNION ALL SELECT 'project', 'contributor', k FROM unnest(ARRAY[
        'project.settings.view',
        'project.members.view',
        'project.workitems.view',
        'project.workitems.create',
        'project.workitems.update.any',
        'project.workitems.delete.own',
        'project.comments.create',
        'project.comments.update.own',
        'project.comments.delete.own',
        'project.reactions.create',
        'project.cycles.view',
        'project.cycles.create',
        'project.cycles.update.any',
        'project.cycles.delete.own',
        'project.modules.view',
        'project.modules.create',
        'project.modules.update.any',
        'project.modules.delete.own',
        'project.views.view',
        'project.views.create',
        'project.views.update.own',
        'project.views.delete.own',
        'project.pages.view',
        'project.pages.create',
        'project.pages.update.own',
        'project.pages.delete.own',
        'project.labels.view',
        'project.states.view',
        'project.estimates.view',
        'project.analytics.view',
        'project.analytics.export'
      ]::varchar[]) k
      UNION ALL SELECT 'project', 'commenter', k FROM unnest(ARRAY[
        'project.settings.view',
        'project.members.view',
        'project.workitems.view',
        'project.comments.create',
        'project.comments.update.own',
        'project.comments.delete.own',
        'project.reactions.create',
        'project.cycles.view',
        'project.modules.view',
        'project.views.view',
        'project.pages.view',
        'project.labels.view',
        'project.states.view',
        'project.estimates.view',
        'project.analytics.view'
      ]::varchar[]) k
      UNION ALL SELECT 'project', 'guest', k FROM unnest(ARRAY[
        'project.settings.view',
        'project.workitems.view',
        'project.cycles.view',
        'project.modules.view',
        'project.views.view',
        'project.pages.view',
        'project.labels.view',
        'project.states.view',
        'project.estimates.view',
        'project.analytics.view'
      ]::varchar[]) k;

      INSERT INTO role_permission_history (scope, role_key, permission_key, change_type, created_at)
      SELECT scope, role_key, permission_key, 'seeded', created_at FROM role_permissions;
    `);

    // 6. workspace_members → roles
    await queryRunner.query(`
      ALTER TABLE workspace_members
        ADD COLUMN role_scope varchar(16) NOT NULL DEFAULT 'workspace',
        ADD CONSTRAINT workspace_members_role_scope_check CHECK (role_scope = 'workspace');
      ALTER TABLE workspace_members
        ADD CONSTRAINT workspace_members_role_fkey
        FOREIGN KEY (role_scope, role) REFERENCES roles (scope, key) NOT VALID;
      ALTER TABLE workspace_members VALIDATE CONSTRAINT workspace_members_role_fkey;
      ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_role_check;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      ALTER TABLE workspace_members
        ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'member', 'guest'));
      ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_role_fkey;
      ALTER TABLE workspace_members DROP COLUMN role_scope;
      DROP TABLE IF EXISTS role_permission_history;
      DROP TABLE IF EXISTS role_permissions;
      DROP TABLE IF EXISTS permissions;
      DROP TABLE IF EXISTS roles;
    `);
  }
}

