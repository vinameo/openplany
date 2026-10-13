import type { MigrationInterface, QueryRunner } from 'typeorm';

// Merge role workspace and project feature (packages/docs/13-merge-role-workspace-project/3-database-spec.md B2).
// Hand-written migration: do not regenerate with migration:generate (B0).
export class RenameProjectGuestToViewer1791610000000 implements MigrationInterface {
  name = 'RenameProjectGuestToViewer1791610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const viewerRows = (await queryRunner.query(
      `SELECT 1 FROM roles WHERE scope = 'project' AND key = 'viewer'`,
    )) as unknown[];
    if (viewerRows.length > 0) {
      throw new Error(
        "Cannot rename project role 'guest': role 'viewer' already exists in roles.",
      );
    }

    const guestRows = (await queryRunner.query(
      `SELECT 1 FROM roles WHERE scope = 'project' AND key = 'guest'`,
    )) as unknown[];
    if (guestRows.length === 0) {
      throw new Error(
        "Cannot rename project role 'guest': role 'guest' does not exist in roles.",
      );
    }

    await queryRunner.query(`
      INSERT INTO roles (scope, key, permissions_version, created_at, updated_at)
      SELECT scope, 'viewer', permissions_version, created_at, updated_at
      FROM roles
      WHERE scope = 'project' AND key = 'guest';
    `);

    await queryRunner.query(`
      UPDATE role_permissions
      SET role_key = 'viewer'
      WHERE scope = 'project' AND role_key = 'guest';
    `);

    await queryRunner.query(`
      UPDATE role_permission_history
      SET role_key = 'viewer'
      WHERE scope = 'project' AND role_key = 'guest';
    `);

    await queryRunner.query(`
      UPDATE project_members
      SET role = 'viewer'
      WHERE role = 'guest';
    `);

    await queryRunner.query(`
      UPDATE project_member_role_history
      SET from_role = 'viewer'
      WHERE from_role = 'guest';
    `);

    await queryRunner.query(`
      UPDATE project_member_role_history
      SET to_role = 'viewer'
      WHERE to_role = 'guest';
    `);

    await queryRunner.query(`
      DELETE FROM roles
      WHERE scope = 'project' AND key = 'guest';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const guestRows = (await queryRunner.query(
      `SELECT 1 FROM roles WHERE scope = 'project' AND key = 'guest'`,
    )) as unknown[];
    if (guestRows.length > 0) {
      throw new Error(
        "Cannot revert RenameProjectGuestToViewer: role 'guest' already exists in roles.",
      );
    }

    const viewerRows = (await queryRunner.query(
      `SELECT 1 FROM roles WHERE scope = 'project' AND key = 'viewer'`,
    )) as unknown[];
    if (viewerRows.length === 0) {
      throw new Error(
        "Cannot revert RenameProjectGuestToViewer: role 'viewer' does not exist in roles.",
      );
    }

    await queryRunner.query(`
      INSERT INTO roles (scope, key, permissions_version, created_at, updated_at)
      SELECT scope, 'guest', permissions_version, created_at, updated_at
      FROM roles
      WHERE scope = 'project' AND key = 'viewer';
    `);

    await queryRunner.query(`
      UPDATE role_permissions
      SET role_key = 'guest'
      WHERE scope = 'project' AND role_key = 'viewer';
    `);

    await queryRunner.query(`
      UPDATE role_permission_history
      SET role_key = 'guest'
      WHERE scope = 'project' AND role_key = 'viewer';
    `);

    await queryRunner.query(`
      UPDATE project_members
      SET role = 'guest'
      WHERE role = 'viewer';
    `);

    await queryRunner.query(`
      UPDATE project_member_role_history
      SET from_role = 'guest'
      WHERE from_role = 'viewer';
    `);

    await queryRunner.query(`
      UPDATE project_member_role_history
      SET to_role = 'guest'
      WHERE to_role = 'viewer';
    `);

    await queryRunner.query(`
      DELETE FROM roles
      WHERE scope = 'project' AND key = 'viewer';
    `);
  }
}
