import type { MigrationInterface, QueryRunner } from 'typeorm';

// Members feature (packages/docs/7-add-member-to-workspace/3-database-spec.md B2).
// Adds joined_at column to track when a member joined the workspace.
export class AddWorkspaceMemberJoinedAt1791604000000 implements MigrationInterface {
  name = 'AddWorkspaceMemberJoinedAt1791604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE workspace_members ADD COLUMN joined_at timestamptz`,
    );
    await queryRunner.query(
      `UPDATE workspace_members SET joined_at = created_at`,
    );
    await queryRunner.query(
      `ALTER TABLE workspace_members ALTER COLUMN joined_at SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE workspace_members ALTER COLUMN joined_at SET DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE workspace_members DROP COLUMN IF EXISTS joined_at`,
    );
  }
}

