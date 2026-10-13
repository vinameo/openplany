import type { MigrationInterface, QueryRunner } from 'typeorm';

// Members feature (packages/docs/12-add-member-to-project/3-database-spec.md B2).
// Hand-written migration: do not regenerate with migration:generate (B0).
export class AddProjectMemberJoinedAt1791609000000 implements MigrationInterface {
  name = 'AddProjectMemberJoinedAt1791609000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(
      `ALTER TABLE project_members ADD COLUMN joined_at timestamptz`,
    );
    await queryRunner.query(
      `UPDATE project_members SET joined_at = created_at`,
    );
    await queryRunner.query(
      `ALTER TABLE project_members ALTER COLUMN joined_at SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE project_members ALTER COLUMN joined_at SET DEFAULT now()`,
    );

    await queryRunner.query(
      `ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check`,
    );
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created', 'member_added'))
    `);

    await queryRunner.query(
      `ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_shape_check`,
    );
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_shape_check CHECK (
        CASE change_type
          WHEN 'project_created' THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'member_added'    THEN from_role IS NULL AND to_role IS NOT NULL
          ELSE false
        END
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const rows = (await queryRunner.query(
      `SELECT count(*) AS count FROM project_member_role_history WHERE change_type = 'member_added'`,
    )) as { count: string | number }[];
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot revert AddProjectMemberJoinedAt: ${count} project role history rows use change_type 'member_added'. Remove them deliberately before reverting.`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_shape_check`,
    );
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_shape_check CHECK (
        CASE change_type
          WHEN 'project_created' THEN from_role IS NULL AND to_role IS NOT NULL
          ELSE false
        END
      )
    `);

    await queryRunner.query(
      `ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_change_type_check`,
    );
    await queryRunner.query(`
      ALTER TABLE project_member_role_history ADD CONSTRAINT pmrh_change_type_check
        CHECK (change_type IN ('project_created'))
    `);

    await queryRunner.query(
      `ALTER TABLE project_members DROP COLUMN joined_at`,
    );
  }
}
