import type { MigrationInterface, QueryRunner } from 'typeorm';

// Roles and permissions feature (packages/docs/6-roles-and-permissions/3-database-spec.md B13).
// Removes workspace owner role, migrates owners to admin, drops owner_id from workspaces.
export class RemoveWorkspaceOwnerRole1791550200000 implements MigrationInterface {
  name = 'RemoveWorkspaceOwnerRole1791550200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Nới ràng buộc sổ lịch sử: thêm 'owner_role_retired'; workspace_created nhận 'admin'
    await queryRunner.query(`
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_change_type_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_change_type_check CHECK (change_type IN (
        'workspace_created', 'member_added', 'role_changed', 'ownership_transferred',
        'member_removed', 'backfill', 'owner_role_retired'
      ));
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_shape_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_shape_check CHECK (
        CASE change_type
          WHEN 'workspace_created'     THEN from_role IS NULL AND to_role IN ('admin', 'owner')
          WHEN 'member_added'          THEN from_role IS NULL AND to_role IS NOT NULL AND to_role <> 'owner'
          WHEN 'backfill'              THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'role_changed'          THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND from_role <> 'owner' AND to_role <> 'owner'
          WHEN 'ownership_transferred' THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND (from_role = 'owner' OR to_role = 'owner')
          WHEN 'member_removed'        THEN from_role IS NOT NULL AND from_role <> 'owner' AND to_role IS NULL
          WHEN 'owner_role_retired'    THEN from_role = 'owner' AND to_role = 'admin'
          ELSE false
        END
      );
    `);

    // 2. Ghi sổ trước khi đổi (from_role phải là vai trò thật lúc đó)
    await queryRunner.query(`
      INSERT INTO workspace_member_role_history
        (workspace_id, member_id, from_role, to_role, change_type, actor_id, request_id, created_at)
      SELECT workspace_id, member_id, 'owner', 'admin', 'owner_role_retired', NULL, NULL, now()
      FROM workspace_members
      WHERE role = 'owner' AND is_active;
    `);

    // 3. Owner → Admin
    await queryRunner.query(`
      DROP INDEX workspace_members_one_owner_key;
      ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_role_check;
      UPDATE workspace_members SET role = 'admin', updated_at = now() WHERE role = 'owner';
      ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
        CHECK (role IN ('admin', 'member', 'guest'));
    `);

    // 4. Bỏ owner_id (chỉ được ghi, không nơi nào đọc; người tạo ở created_by_id)
    await queryRunner.query(`
      DROP INDEX idx_workspaces_owner_id;
      ALTER TABLE workspaces DROP COLUMN owner_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      ALTER TABLE workspaces ADD COLUMN owner_id uuid REFERENCES users (id);
      UPDATE workspaces w SET owner_id = h.member_id
      FROM workspace_member_role_history h
      WHERE h.workspace_id = w.id AND h.change_type = 'owner_role_retired';
      UPDATE workspaces SET owner_id = created_by_id WHERE owner_id IS NULL;
      ALTER TABLE workspaces ALTER COLUMN owner_id SET NOT NULL;
      CREATE INDEX idx_workspaces_owner_id ON workspaces (owner_id);

      ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_role_check;
      UPDATE workspace_members m SET role = 'owner', updated_at = now()
      FROM workspaces w
      WHERE m.workspace_id = w.id AND m.member_id = w.owner_id AND m.role = 'admin';
      ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
        CHECK (role IN ('owner', 'admin', 'member', 'guest'));
      CREATE UNIQUE INDEX workspace_members_one_owner_key ON workspace_members (workspace_id) WHERE role = 'owner';

      DELETE FROM workspace_member_role_history WHERE change_type = 'owner_role_retired';
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_shape_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_shape_check CHECK (
        CASE change_type
          WHEN 'workspace_created'     THEN from_role IS NULL AND to_role = 'owner'
          WHEN 'member_added'          THEN from_role IS NULL AND to_role <> 'owner'
          WHEN 'backfill'              THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'role_changed'          THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND from_role <> 'owner' AND to_role <> 'owner'
          WHEN 'ownership_transferred' THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND (from_role = 'owner' OR to_role = 'owner')
          WHEN 'member_removed'        THEN from_role IS NOT NULL AND from_role <> 'owner' AND to_role IS NULL
          ELSE false
        END
      ) NOT VALID;
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_change_type_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_change_type_check CHECK (change_type IN (
        'workspace_created', 'member_added', 'role_changed',
        'ownership_transferred', 'member_removed', 'backfill'
      )) NOT VALID;
    `);
  }
}

