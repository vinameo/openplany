import type { MigrationInterface, QueryRunner } from 'typeorm';

// Change project role feature (packages/docs/15-change-project-role/3-database-spec.md B2).
// Hand-written migration: do not regenerate with migration:generate (B0).
export class AddProjectRoleChangedHistory1791610300000
  implements MigrationInterface
{
  name = 'AddProjectRoleChangedHistory1791610300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created', 'member_added', 'workspace_role_applied', 'role_changed')) NOT VALID
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
          WHEN 'role_changed'           THEN from_role IS NOT NULL AND to_role IS NOT NULL AND to_role <> from_role
          ELSE false
        END
      ) NOT VALID
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history VALIDATE CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history VALIDATE CONSTRAINT pmrh_shape_check
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const rows = (await queryRunner.query(
      `SELECT count(*) AS count FROM project_member_role_history WHERE change_type = 'role_changed'`,
    )) as { count: string | number }[];
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot revert AddProjectRoleChangedHistory: ${count} project role history rows use change_type 'role_changed'. Remove them deliberately before reverting.`,
      );
    }

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
      ) NOT VALID
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created', 'member_added', 'workspace_role_applied')) NOT VALID
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history VALIDATE CONSTRAINT pmrh_change_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_member_role_history VALIDATE CONSTRAINT pmrh_shape_check
    `);
  }
}
