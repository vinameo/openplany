// Create project feature (packages/docs/9-create-project/3-database-spec.md). Hand-written: do not regenerate with migration:generate (DB-F1).
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectTables1791605000000 implements MigrationInterface {
  name = 'CreateProjectTables1791605000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. projects
    await queryRunner.query(`
      CREATE TABLE projects (
        id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid          NOT NULL
                       CONSTRAINT projects_workspace_id_fkey REFERENCES workspaces (id) ON DELETE CASCADE,
        name           varchar(80)   NOT NULL,
        identifier     varchar(5)    NOT NULL,
        description    text          NOT NULL DEFAULT '',
        icon_name      varchar(64)   NOT NULL,
        icon_color     varchar(7)    NOT NULL,
        cover_key      varchar(32)   NOT NULL,
        created_by_id  uuid          CONSTRAINT projects_created_by_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        updated_by_id  uuid          CONSTRAINT projects_updated_by_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        created_at     timestamptz   NOT NULL DEFAULT now(),
        updated_at     timestamptz   NOT NULL DEFAULT now(),
        deleted_at     timestamptz,

        CONSTRAINT projects_id_workspace_key        UNIQUE (id, workspace_id),
        CONSTRAINT projects_name_check              CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)),
        CONSTRAINT projects_identifier_check        CHECK (identifier ~ '^[A-Z][A-Z0-9]{0,4}$'),
        CONSTRAINT projects_description_check       CHECK (char_length(description) <= 2000),
        CONSTRAINT projects_icon_color_check        CHECK (icon_color ~ '^#[0-9A-F]{6}$')
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX projects_workspace_name_lower_key
        ON projects (workspace_id, lower(name)) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX projects_workspace_identifier_key
        ON projects (workspace_id, identifier) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_projects_workspace_created
        ON projects (workspace_id, created_at DESC) WHERE deleted_at IS NULL
    `);

    // 2. project_members (theo RP-RQ B10)
    await queryRunner.query(`
      CREATE TABLE project_members (
        id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid          NOT NULL,
        project_id     uuid          NOT NULL,
        member_id      uuid          NOT NULL,
        role_scope     varchar(16)   NOT NULL DEFAULT 'project',
        role           varchar(20)   NOT NULL,
        is_active      boolean       NOT NULL DEFAULT true,
        created_by_id  uuid          CONSTRAINT project_members_created_by_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        created_at     timestamptz   NOT NULL DEFAULT now(),
        updated_at     timestamptz   NOT NULL DEFAULT now(),

        CONSTRAINT project_members_role_scope_check CHECK (role_scope = 'project'),
        CONSTRAINT project_members_role_fkey
          FOREIGN KEY (role_scope, role) REFERENCES roles (scope, key),
        CONSTRAINT project_members_project_member_key UNIQUE (project_id, member_id),
        CONSTRAINT project_members_project_fkey
          FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
        CONSTRAINT project_members_workspace_member_fkey
          FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members (workspace_id, member_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_project_members_workspace_member_active
        ON project_members (workspace_id, member_id) WHERE is_active
    `);

    // 3. Lịch sử vai trò project (D19, ADR-08)
    await queryRunner.query(`
      CREATE TABLE project_member_role_history (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid          NOT NULL
                      CONSTRAINT pmrh_workspace_id_fkey REFERENCES workspaces (id) ON DELETE CASCADE,
        project_id    uuid          NOT NULL
                      CONSTRAINT pmrh_project_id_fkey REFERENCES projects (id) ON DELETE CASCADE,
        member_id     uuid          NOT NULL
                      CONSTRAINT pmrh_member_id_fkey REFERENCES users (id),
        role_scope    varchar(16)   NOT NULL DEFAULT 'project',
        from_role     varchar(20),
        to_role       varchar(20),
        change_type   varchar(30)   NOT NULL,
        actor_id      uuid          CONSTRAINT pmrh_actor_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        request_id    varchar(128),
        created_at    timestamptz   NOT NULL DEFAULT now(),

        CONSTRAINT pmrh_role_scope_check CHECK (role_scope = 'project'),
        CONSTRAINT pmrh_from_role_fkey FOREIGN KEY (role_scope, from_role) REFERENCES roles (scope, key),
        CONSTRAINT pmrh_to_role_fkey   FOREIGN KEY (role_scope, to_role)   REFERENCES roles (scope, key),
        CONSTRAINT pmrh_change_type_check CHECK (change_type IN ('project_created')),
        CONSTRAINT pmrh_shape_check CHECK (
          CASE change_type
            WHEN 'project_created' THEN from_role IS NULL AND to_role IS NOT NULL
            ELSE false
          END
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_pmrh_project_created ON project_member_role_history (project_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`DROP TABLE project_member_role_history`);
    await queryRunner.query(`DROP TABLE project_members`);
    await queryRunner.query(`DROP TABLE projects`);
  }
}
