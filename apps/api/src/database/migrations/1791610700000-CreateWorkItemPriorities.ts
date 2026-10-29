// Priority work item feature (packages/docs/22-priority-work-item/3-database-spec.md DB B2).
// Hand-written migration: do not regenerate with migration:generate.
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkItemPriorities1791610700000 implements MigrationInterface {
  name = 'CreateWorkItemPriorities1791610700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Pre-checks
    const existingTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'work_item_priorities'`,
    );
    if (existingTable.length > 0) {
      throw new Error(
        'Cannot create work_item_priorities: table already exists.',
      );
    }

    const existingCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'work_items' AND column_name = 'priority_id'`,
    );
    if (existingCol.length > 0) {
      throw new Error(
        'Cannot create work_items.priority_id: column already exists.',
      );
    }

    const existingFunc = await queryRunner.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'work_item_priorities_protect_defaults'`,
    );
    if (existingFunc.length > 0) {
      throw new Error(
        'Cannot create work_item_priorities: trigger function already exists.',
      );
    }

    // 2. Create work_item_priorities table
    await queryRunner.query(`
      CREATE TABLE work_item_priorities (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        level         varchar(16)   NOT NULL,
        default_key   varchar(32),
        workspace_id  uuid,
        project_id    uuid,
        name          varchar(40)   NOT NULL,
        priority_band varchar(16)   NOT NULL,
        color         varchar(7)    NOT NULL,
        created_by_id uuid,
        updated_by_id uuid,
        deleted_by_id uuid,
        created_at    timestamptz   NOT NULL,
        updated_at    timestamptz   NOT NULL,
        deleted_at    timestamptz,

        CONSTRAINT work_item_priorities_level_check
          CHECK (level IN ('default', 'workspace', 'project')),
        CONSTRAINT work_item_priorities_workspace_fkey
          FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
        CONSTRAINT work_item_priorities_project_fkey
          FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
        CONSTRAINT work_item_priorities_created_by_fkey
          FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_priorities_updated_by_fkey
          FOREIGN KEY (updated_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_priorities_deleted_by_fkey
          FOREIGN KEY (deleted_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_priorities_name_check
          CHECK (char_length(name) BETWEEN 1 AND 40 AND name = btrim(name)),
        CONSTRAINT work_item_priorities_priority_band_check
          CHECK (priority_band IN ('urgent', 'high', 'medium', 'low', 'none')),
        CONSTRAINT work_item_priorities_color_check
          CHECK (color ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT work_item_priorities_default_key_check
          CHECK (default_key IS NULL OR default_key IN ('urgent', 'high', 'medium', 'low', 'none')),
        CONSTRAINT work_item_priorities_level_shape_check
          CHECK (
            (level = 'default' AND default_key IS NOT NULL AND workspace_id IS NULL AND project_id IS NULL AND deleted_at IS NULL)
            OR
            (level = 'workspace' AND default_key IS NULL AND workspace_id IS NOT NULL AND project_id IS NULL)
            OR
            (level = 'project' AND default_key IS NULL AND workspace_id IS NOT NULL AND project_id IS NOT NULL)
          )
      )
    `);

    // 3. Create indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_priorities_default_key_key
        ON work_item_priorities (default_key)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_priorities_default_name_key
        ON work_item_priorities (lower(name))
        WHERE level = 'default'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_priorities_workspace_name_key
        ON work_item_priorities (workspace_id, lower(name))
        WHERE level = 'workspace' AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_priorities_project_name_key
        ON work_item_priorities (project_id, lower(name))
        WHERE level = 'project' AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_priorities_workspace_id_idx
        ON work_item_priorities (workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_priorities_project_id_idx
        ON work_item_priorities (project_id, workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_priorities_created_by_id_idx
        ON work_item_priorities (created_by_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_priorities_updated_by_id_idx
        ON work_item_priorities (updated_by_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_priorities_deleted_by_id_idx
        ON work_item_priorities (deleted_by_id)
    `);

    // 4. Seed 5 default rows
    await queryRunner.query(`
      INSERT INTO work_item_priorities
        (level, default_key, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
      VALUES
        ('default', 'urgent', NULL, NULL, 'Urgent', 'urgent', '#B05A5A', now(), now()),
        ('default', 'high', NULL, NULL, 'High', 'high', '#D0642B', now(), now()),
        ('default', 'medium', NULL, NULL, 'Medium', 'medium', '#E08A1E', now(), now()),
        ('default', 'low', NULL, NULL, 'Low', 'low', '#3E7BD6', now(), now()),
        ('default', 'none', NULL, NULL, 'None', 'none', '#8E98A8', now(), now())
    `);

    // 5. Create protection trigger function and trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION work_item_priorities_protect_defaults()
      RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.level = 'default' THEN
            RAISE EXCEPTION 'cannot insert default level row into work_item_priorities'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.level = 'default' THEN
            RAISE EXCEPTION 'cannot modify default level row in work_item_priorities'
              USING ERRCODE = 'check_violation';
          END IF;
          IF NEW.level <> OLD.level
             OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
             OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            RAISE EXCEPTION 'cannot change level, workspace_id, or project_id of work_item_priorities'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          IF OLD.level = 'default' THEN
            RAISE EXCEPTION 'cannot delete default level row from work_item_priorities'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER work_item_priorities_protect_defaults
        BEFORE INSERT OR UPDATE OR DELETE
        ON work_item_priorities
        FOR EACH ROW EXECUTE FUNCTION work_item_priorities_protect_defaults();
    `);

    // 6. Add work_items.priority_id, backfill None for ALL rows, set NOT NULL, add FK and index
    await queryRunner.query(`
      ALTER TABLE work_items
        ADD COLUMN priority_id uuid;
    `);

    await queryRunner.query(`
      UPDATE work_items
      SET priority_id = (SELECT id FROM work_item_priorities WHERE default_key = 'none')
    `);

    await queryRunner.query(`
      ALTER TABLE work_items
        ALTER COLUMN priority_id SET NOT NULL,
        ADD CONSTRAINT work_items_priority_id_fkey
          FOREIGN KEY (priority_id) REFERENCES work_item_priorities (id) ON DELETE RESTRICT;
    `);

    await queryRunner.query(`
      CREATE INDEX work_items_priority_id_idx ON work_items (priority_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Remove work_items.priority_id column, FK and index
    await queryRunner.query(`
      ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_priority_id_fkey
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS work_items_priority_id_idx
    `);
    await queryRunner.query(`
      ALTER TABLE work_items DROP COLUMN IF EXISTS priority_id
    `);

    // 2. Drop trigger and function
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS work_item_priorities_protect_defaults ON work_item_priorities
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS work_item_priorities_protect_defaults()
    `);

    // 3. Drop work_item_priorities table
    await queryRunner.query(`
      DROP TABLE IF EXISTS work_item_priorities
    `);
  }
}
