import type { MigrationInterface, QueryRunner } from 'typeorm';

// Create user feature (packages/docs/5-create-user/3-database-spec.md B2).
// Who created an account from the app. NULL for CLI-created and older users.
export class AddUsersCreatedBy1791534730151 implements MigrationInterface {
  name = 'AddUsersCreatedBy1791534730151';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Every signed-in request reads users: fail fast instead of queueing them (DB-F3).
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN created_by_id uuid
          CONSTRAINT users_created_by_id_fkey REFERENCES users (id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS created_by_id`);
  }
}
