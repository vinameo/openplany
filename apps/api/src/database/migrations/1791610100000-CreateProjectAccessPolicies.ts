import type { MigrationInterface, QueryRunner } from 'typeorm';

// Merge role workspace and project feature (packages/docs/13-merge-role-workspace-project/3-database-spec.md B3).
// Hand-written migration: do not regenerate with migration:generate (B0).
export class CreateProjectAccessPolicies1791610100000 implements MigrationInterface {
  name = 'CreateProjectAccessPolicies1791610100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const existingTable = (await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'project_access_policies'`,
    )) as unknown[];
    if (existingTable.length > 0) {
      throw new Error(
        'Cannot create project_access_policies: table already exists.',
      );
    }

    await queryRunner.query(`
      CREATE TABLE project_access_policies (
        workspace_role_scope     varchar(16)  NOT NULL DEFAULT 'workspace',
        workspace_role           varchar(20)  NOT NULL,
        project_role_scope       varchar(16)  NOT NULL DEFAULT 'project',
        implicit_project_role    varchar(20),
        lowest_assignable_role   varchar(20)  NOT NULL,
        highest_assignable_role  varchar(20)  NOT NULL,
        overrides_project_rank   boolean      NOT NULL,
        CONSTRAINT project_access_policies_pkey PRIMARY KEY (workspace_role_scope, workspace_role),
        CONSTRAINT pap_workspace_role_scope_check CHECK (workspace_role_scope = 'workspace'),
        CONSTRAINT pap_project_role_scope_check   CHECK (project_role_scope = 'project'),
        CONSTRAINT pap_workspace_role_fkey FOREIGN KEY (workspace_role_scope, workspace_role)   REFERENCES roles (scope, key),
        CONSTRAINT pap_implicit_role_fkey  FOREIGN KEY (project_role_scope, implicit_project_role)   REFERENCES roles (scope, key),
        CONSTRAINT pap_lowest_role_fkey    FOREIGN KEY (project_role_scope, lowest_assignable_role)  REFERENCES roles (scope, key),
        CONSTRAINT pap_highest_role_fkey   FOREIGN KEY (project_role_scope, highest_assignable_role) REFERENCES roles (scope, key),
        CONSTRAINT pap_implicit_range_check CHECK (
          implicit_project_role IS NULL
          OR (lowest_assignable_role = implicit_project_role AND highest_assignable_role = implicit_project_role)
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_pap_implicit_role ON project_access_policies (project_role_scope, implicit_project_role);
      CREATE INDEX idx_pap_lowest_role   ON project_access_policies (project_role_scope, lowest_assignable_role);
      CREATE INDEX idx_pap_highest_role  ON project_access_policies (project_role_scope, highest_assignable_role);
    `);

    await queryRunner.query(`
      INSERT INTO project_access_policies
        (workspace_role, implicit_project_role, lowest_assignable_role, highest_assignable_role, overrides_project_rank)
      VALUES
        ('admin',  'admin', 'admin',     'admin',  true),
        ('member', NULL,    'commenter', 'admin',  false),
        ('guest',  NULL,    'viewer',    'viewer', false);
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created', 'member_added', 'workspace_role_applied'))
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_shape_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_shape_check CHECK (
        CASE change_type
          WHEN 'project_created'        THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'member_added'           THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'workspace_role_applied' THEN from_role IS NOT NULL AND (to_role IS NULL OR to_role <> from_role)
          ELSE false
        END
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const rows = (await queryRunner.query(
      `SELECT count(*) AS count FROM project_member_role_history WHERE change_type = 'workspace_role_applied'`,
    )) as { count: string | number }[];
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot revert CreateProjectAccessPolicies: ${count} project role history rows use change_type 'workspace_role_applied'. Revert ApplyProjectAccessPolicies first, or remove them deliberately.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_shape_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_shape_check CHECK (
        CASE change_type
          WHEN 'project_created' THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'member_added'    THEN from_role IS NULL AND to_role IS NOT NULL
          ELSE false
        END
      )
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created', 'member_added'))
    `);

    await queryRunner.query(`DROP TABLE project_access_policies`);
  }
}
