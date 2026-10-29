// Work item states feature (packages/docs/21-state-work-item/3-database-spec.md DB B2).
// Hand-written migration: do not regenerate with migration:generate.
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkItemStates1791610600000 implements MigrationInterface {
  name = 'CreateWorkItemStates1791610600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Pre-checks
    const existingTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'work_item_states'`,
    );
    if (existingTable.length > 0) {
      throw new Error('Cannot create work_item_states: table already exists.');
    }

    const existingCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'work_items' AND column_name = 'state_id'`,
    );
    if (existingCol.length > 0) {
      throw new Error(
        'Cannot create work_items.state_id: column already exists.',
      );
    }

    const existingPerm = await queryRunner.query(
      `SELECT 1 FROM permissions WHERE key = 'workspace.states.manage'`,
    );
    if (existingPerm.length > 0) {
      throw new Error(
        'Cannot add permission workspace.states.manage: permission already exists.',
      );
    }

    // 2. Create work_item_states table
    await queryRunner.query(`
      CREATE TABLE work_item_states (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        level         varchar(16)   NOT NULL,
        default_key   varchar(32),
        workspace_id  uuid,
        project_id    uuid,
        name          varchar(40)   NOT NULL,
        state_group   varchar(16)   NOT NULL,
        color         varchar(7)    NOT NULL,
        created_by_id uuid,
        updated_by_id uuid,
        deleted_by_id uuid,
        created_at    timestamptz   NOT NULL,
        updated_at    timestamptz   NOT NULL,
        deleted_at    timestamptz,

        CONSTRAINT work_item_states_level_check
          CHECK (level IN ('default', 'workspace', 'project')),
        CONSTRAINT work_item_states_workspace_fkey
          FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
        CONSTRAINT work_item_states_project_fkey
          FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
        CONSTRAINT work_item_states_created_by_fkey
          FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_states_updated_by_fkey
          FOREIGN KEY (updated_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_states_deleted_by_fkey
          FOREIGN KEY (deleted_by_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT work_item_states_name_check
          CHECK (char_length(name) BETWEEN 1 AND 40 AND name = btrim(name)),
        CONSTRAINT work_item_states_state_group_check
          CHECK (state_group IN ('backlog', 'planned', 'active', 'finished', 'cancelled')),
        CONSTRAINT work_item_states_color_check
          CHECK (color ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT work_item_states_level_shape_check
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
      CREATE UNIQUE INDEX work_item_states_default_key_key
        ON work_item_states (default_key)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_states_default_name_key
        ON work_item_states (lower(name))
        WHERE level = 'default'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_states_workspace_name_key
        ON work_item_states (workspace_id, lower(name))
        WHERE level = 'workspace' AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX work_item_states_project_name_key
        ON work_item_states (project_id, lower(name))
        WHERE level = 'project' AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_states_workspace_id_idx
        ON work_item_states (workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_states_project_id_idx
        ON work_item_states (project_id, workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_states_created_by_id_idx
        ON work_item_states (created_by_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_states_updated_by_id_idx
        ON work_item_states (updated_by_id)
    `);
    await queryRunner.query(`
      CREATE INDEX work_item_states_deleted_by_id_idx
        ON work_item_states (deleted_by_id)
    `);

    // 4. Seed 5 default rows
    await queryRunner.query(`
      INSERT INTO work_item_states
        (level, default_key, workspace_id, project_id, name, state_group, color, created_at, updated_at)
      VALUES
        ('default', 'backlog', NULL, NULL, 'Backlog', 'backlog', '#8E98A8', now(), now()),
        ('default', 'todo', NULL, NULL, 'Todo', 'planned', '#5B6B82', now(), now()),
        ('default', 'in_progress', NULL, NULL, 'In Progress', 'active', '#E08A1E', now(), now()),
        ('default', 'done', NULL, NULL, 'Done', 'finished', '#2F9E6E', now(), now()),
        ('default', 'cancelled', NULL, NULL, 'Cancelled', 'cancelled', '#B05A5A', now(), now())
    `);

    // 5. Create protection trigger function and trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION work_item_states_protect_defaults()
      RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.level = 'default' THEN
            RAISE EXCEPTION 'cannot insert default level row into work_item_states'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.level = 'default' THEN
            RAISE EXCEPTION 'cannot modify default level row in work_item_states'
              USING ERRCODE = 'check_violation';
          END IF;
          IF NEW.level <> OLD.level
             OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
             OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            RAISE EXCEPTION 'cannot change level, workspace_id, or project_id of work_item_states'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          IF OLD.level = 'default' THEN
            RAISE EXCEPTION 'cannot delete default level row from work_item_states'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER work_item_states_protect_defaults
        BEFORE INSERT OR UPDATE OR DELETE
        ON work_item_states
        FOR EACH ROW EXECUTE FUNCTION work_item_states_protect_defaults();
    `);

    // 6. Add work_items.state_id, backfill Backlog, set NOT NULL, add FK and index
    await queryRunner.query(`
      ALTER TABLE work_items
        ADD COLUMN state_id uuid;
    `);

    await queryRunner.query(`
      UPDATE work_items
      SET state_id = (SELECT id FROM work_item_states WHERE default_key = 'backlog')
    `);

    await queryRunner.query(`
      ALTER TABLE work_items
        ALTER COLUMN state_id SET NOT NULL,
        ADD CONSTRAINT work_items_state_id_fkey
          FOREIGN KEY (state_id) REFERENCES work_item_states (id) ON DELETE RESTRICT;
    `);

    await queryRunner.query(`
      CREATE INDEX work_items_state_id_idx ON work_items (state_id)
    `);

    // 7. Seed workspace.states.manage permission and grant to workspace admin
    await queryRunner.query(`
      INSERT INTO permissions (key, scope, label, created_at)
      VALUES ('workspace.states.manage', 'workspace', 'Manage workspace states', now())
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
      VALUES ('workspace', 'admin', 'workspace.states.manage', now())
    `);

    await queryRunner.query(`
      INSERT INTO role_permission_history (scope, role_key, permission_key, change_type, actor_id, request_id, created_at)
      VALUES ('workspace', 'admin', 'workspace.states.manage', 'seeded', NULL, NULL, now())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Remove permissions and history
    await queryRunner.query(`
      DELETE FROM role_permission_history WHERE permission_key = 'workspace.states.manage'
    `);
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_key = 'workspace.states.manage'
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE key = 'workspace.states.manage'
    `);

    // 2. Remove work_items.state_id column, FK and index
    await queryRunner.query(`
      ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_state_id_fkey
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS work_items_state_id_idx
    `);
    await queryRunner.query(`
      ALTER TABLE work_items DROP COLUMN IF EXISTS state_id
    `);

    // 3. Drop trigger and function
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS work_item_states_protect_defaults ON work_item_states
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS work_item_states_protect_defaults()
    `);

    // 4. Drop work_item_states table
    await queryRunner.query(`
      DROP TABLE IF EXISTS work_item_states
    `);
  }
}
