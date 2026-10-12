import type { MigrationInterface, QueryRunner } from 'typeorm';

// Project settings -> General (packages/docs/11-project-general-settings/3-database-spec.md B2).
// Hand-written: do not regenerate with migration:generate.
//
// Adds a nullable timezone column to projects. NULL represents following the workspace timezone.
// Note: down() drops the timezone column; custom-configured project timezones will be lost.

export class AddProjectTimezone1791608000000 implements MigrationInterface {
  name = 'AddProjectTimezone1791608000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE projects ADD COLUMN timezone varchar(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE projects ADD CONSTRAINT projects_timezone_not_blank CHECK (timezone IS NULL OR timezone <> '')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`ALTER TABLE projects DROP COLUMN timezone`);
  }
}
