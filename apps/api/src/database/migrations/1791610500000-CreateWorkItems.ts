// Create work items feature (packages/docs/20-new-work-item/3-database-spec.md). Hand-written: do not regenerate with migration:generate (DB-01, DB-02).
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkItems1791610500000 implements MigrationInterface {
  name = 'CreateWorkItems1791610500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const existing = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'work_items'`,
    );
    if (existing.length > 0) {
      throw new Error('Cannot create work_items: table already exists.');
    }

    // 1. projects: last_work_item_number counter
    await queryRunner.query(`
      ALTER TABLE projects
        ADD COLUMN last_work_item_number integer NOT NULL DEFAULT 0,
        ADD CONSTRAINT projects_last_work_item_number_check CHECK (last_work_item_number >= 0)
    `);

    // 2. work_items table
    await queryRunner.query(`
      CREATE TABLE work_items (
        id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid          NOT NULL,
        project_id      uuid          NOT NULL,
        number          integer       NOT NULL,
        title           varchar(255)  NOT NULL,
        description     text          NOT NULL DEFAULT '',
        idempotency_key uuid          NOT NULL,
        created_by_id   uuid          CONSTRAINT work_items_created_by_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        updated_by_id   uuid          CONSTRAINT work_items_updated_by_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        created_at      timestamptz   NOT NULL,
        updated_at      timestamptz   NOT NULL,
        deleted_at      timestamptz,

        CONSTRAINT work_items_project_fkey
          FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
        CONSTRAINT work_items_number_check
          CHECK (number >= 1),
        CONSTRAINT work_items_title_check
          CHECK (char_length(title) >= 1),
        CONSTRAINT work_items_description_check
          CHECK (char_length(description) <= 50000),
        CONSTRAINT work_items_project_number_key
          UNIQUE (project_id, number),
        CONSTRAINT work_items_creator_idempotency_key
          UNIQUE (created_by_id, idempotency_key)
      )
    `);

    // 3. Regular indexes for foreign keys
    await queryRunner.query(`
      CREATE INDEX work_items_workspace_id_idx ON work_items (workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_items_updated_by_id_idx ON work_items (updated_by_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`DROP TABLE work_items`);

    await queryRunner.query(`
      ALTER TABLE projects
        DROP CONSTRAINT projects_last_work_item_number_check,
        DROP COLUMN last_work_item_number
    `);
  }
}

