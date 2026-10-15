import type { MigrationInterface, QueryRunner } from 'typeorm';

// Enable unaccent extension for case- and accent-insensitive search (packages/docs/18-management-users/3-database-spec.md B2).
// Hand-written migration: do not regenerate with migration:generate.
export class EnableUnaccent1791610400000 implements MigrationInterface {
  name = 'EnableUnaccent1791610400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_available_extensions WHERE name = 'unaccent'`,
    )) as unknown[];
    if (rows.length === 0) {
      throw new Error(
        'PostgreSQL extension `unaccent` is not available. Install the postgresql-contrib package (or enable `unaccent` on your managed database) and run the migrations again.',
      );
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS unaccent`);
  }
}
